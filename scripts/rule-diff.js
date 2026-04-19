/**
 * rule-diff.js — backend for `pnpm decide`.
 *
 *   1. Enumerates every rule in every plugin unicute uses.
 *   2. Probes unicute (with category-appropriate options) and the four
 *      reference configs (antfu/sxzz/standard/airbnb) via
 *      ESLint#calculateConfigForFile to learn each rule's effective level.
 *   3. Compares against `rule-diff/.baseline.json` and emits drift alerts
 *      (new rules, changed recommends, retired rules, lost ref aliases).
 *   4. Serves dashboard.html with the whole payload embedded; exposes PUT
 *      endpoints that write rule-diff/{category}.json + .baseline.json back
 *      to disk.
 *
 * The dashboard is the one place you edit unicute decisions — do not hand-
 * edit rule-diff/*.json unless you know what you're doing.
 */

import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import jsPlugin from '@eslint/js'
import commentsPlugin from '@eslint-community/eslint-plugin-eslint-comments'
import reactPlugin from '@eslint-react/eslint-plugin'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import vitestPlugin from '@vitest/eslint-plugin'
import { ESLint } from 'eslint'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import importXPlugin, { flatConfigs as importXFlatConfigs } from 'eslint-plugin-import-x'
import jsdocPlugin from 'eslint-plugin-jsdoc'
import jsoncPlugin, { configs as jsoncConfigs } from 'eslint-plugin-jsonc'
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y'
import nPlugin from 'eslint-plugin-n'
import noOnlyTestsPlugin from 'eslint-plugin-no-only-tests'
import perfectionistPlugin from 'eslint-plugin-perfectionist'
import pnpmPlugin, { configs as pnpmConfigs } from 'eslint-plugin-pnpm'
import * as regexpPlugin from 'eslint-plugin-regexp'
import sveltePlugin from 'eslint-plugin-svelte'
import tailwindPlugin from 'eslint-plugin-tailwindcss'
import tomlPlugin, { configs as tomlConfigs } from 'eslint-plugin-toml'
import unicornPlugin from 'eslint-plugin-unicorn'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'
import vuePlugin from 'eslint-plugin-vue'
import vueA11yPlugin from 'eslint-plugin-vuejs-accessibility'
import ymlPlugin, { configs as ymlConfigs } from 'eslint-plugin-yml'

import unicute from '../src/index.js'
import { SUPERSEDED_BY, SUPERSEDES } from '../src/rule-supersedes.js'

import { resolveRef } from './rule-equivalence.js'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'rule-diff')
const PROBE_DIR = join(ROOT, '.decide-probe')

const cliArgs = process.argv.slice(2)
const argumentOf = (flag, fallback) => {
  const index = cliArgs.indexOf(flag)
  return index === -1 ? fallback : cliArgs[index + 1]
}
const SERVE_PORT = Number(argumentOf('--port', '8080'))
// --static <path> builds a standalone HTML snapshot (read-only dashboard) to
// the given file and exits. No server, no HTTP endpoints, no editing UI.
// Intended for publishing as a static page (GitHub Pages, etc.).
const STATIC_OUT = argumentOf('--static', null)

// ─── probe files ──────────────────────────────────────────────────────────

const PROBE_FILES = {
  'probe.js': 'export const x = 1\n',
  'probe.cjs': 'module.exports = 1\n',
  'probe.ts': 'export const x: number = 1\n',
  'probe.tsx': 'export const X = () => null\n',
  'probe.jsx': 'export const X = () => null\n',
  'probe.vue': '<template><div /></template>\n<script setup lang="ts">const x = 1</script>\n',
  'probe.svelte': '<script lang="ts">let x = 1</script>\n<div>{x}</div>\n',
  'probe.md': '# hi\n',
  'probe.json': '{}\n',
  'probe.jsonc': '{}\n',
  'probe.yaml': 'foo: 1\n',
  'probe.toml': 'foo = 1\n',
  'probe.test.ts': "import { test } from 'vitest'; test('x', () => {})\n",
  'probe.html': '<div></div>\n',
  'package.json': '{ "name": "probe", "version": "0.0.0" }\n',
  'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
}

function setupProbeDir() {
  rmSync(PROBE_DIR, { force: true, recursive: true })
  mkdirSync(PROBE_DIR, { recursive: true })
  for (const [name, content] of Object.entries(PROBE_FILES)) {
    writeFileSync(join(PROBE_DIR, name), content)
  }
}

// ─── levels ───────────────────────────────────────────────────────────────

/** Collapse a rule's config entry to just its severity level. */
function level(value) {
  const lvl = Array.isArray(value) ? value[0] : value
  if (lvl === 0 || lvl === 'off') return 'off'
  if (lvl === 1 || lvl === 'warn') return 'warn'
  if (lvl === 2 || lvl === 'error') return 'error'
  return null
}
function optionsOf(value) {
  return Array.isArray(value) ? value.slice(1) : []
}

// ─── rule-meta extraction from plugins ────────────────────────────────────

function normalizeSchema(schema) {
  if (!schema) return []
  if (Array.isArray(schema)) return schema
  if (schema.items) return Array.isArray(schema.items) ? schema.items : [schema.items]
  return []
}

function extractMeta(rule, id) {
  const rec = rule?.meta?.docs?.recommended
  let recommendedTiers = []
  if (typeof rec === 'string') recommendedTiers = [rec]
  else if (rec === true) recommendedTiers = ['recommended']
  else if (rec && typeof rec === 'object') recommendedTiers = Object.keys(rec)
  const ebr = rule?.meta?.docs?.extendsBaseRule
  const baseRuleName = ebr === true ? id.split('/').at(-1) : typeof ebr === 'string' ? ebr : null
  let schema
  try {
    schema = normalizeSchema(rule?.meta?.schema)
  } catch {
    schema = []
  }
  return {
    baseRuleName,
    deprecated: !!rule?.meta?.deprecated,
    description: rule?.meta?.docs?.description ?? '',
    extendsBaseRule: !!ebr,
    recommendedTiers,
    requiresTypeChecking: !!rule?.meta?.docs?.requiresTypeChecking,
    schema,
    url: rule?.meta?.docs?.url ?? '',
  }
}

// ─── category registry ────────────────────────────────────────────────────

/**
 * Each category maps 1:1 to a rule-diff/{id}.json file. `enumerate()` returns
 * every rule the category's plugins provide (not just recommended). `probe`
 * is the file ESLint calculateConfigForFile runs against. `unicuteOptions`
 * is what we pass into `unicute()` to materialize that category.
 *
 * Some categories span multiple plugin prefixes (imports, testing) — that's
 * fine, the JSON file key is the rule ID and carries its own prefix.
 */
const CATEGORIES = [
  {
    id: 'javascript',
    label: 'javascript (core)',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () =>
      [...builtinRules].map(([name, rule]) => ({
        id: name,
        meta: {
          ...extractMeta(rule, name),
          url: extractMeta(rule, name).url || `https://eslint.org/docs/latest/rules/${name}`,
        },
      })),
    packages: ['eslint'],
    recommendedPreset: () => [jsPlugin.configs.recommended],
  },
  {
    // Scope-only override category for `.cjs` / `.cts`. No native plugin —
    // rules here are always "foreign" (added by user from other categories
    // in the dashboard) and apply only on CJS files. Useful for rules whose
    // correct stance differs under CJS (e.g. `import-x/no-useless-path-segments`
    // with `noUselessIndex: false` matching CJS's directory-index resolution).
    id: 'commonjs',
    label: 'commonjs (.cjs / .cts scope)',
    probe: 'probe.cjs',
    unicuteOptions: {},
    enumerate: () => [],
    packages: [],
    recommendedPreset: () => [],
  },
  {
    id: 'typescript',
    label: 'typescript',
    probe: 'probe.ts',
    unicuteOptions: { typescript: true },
    enumerate: () =>
      Object.entries(tsPlugin.rules ?? {}).map(([name, rule]) => {
        const id = `@typescript-eslint/${name}`
        const meta = extractMeta(rule, id)
        return {
          id,
          meta: { ...meta, url: meta.url || `https://typescript-eslint.io/rules/${name}` },
        }
      }),
    packages: ['@typescript-eslint/eslint-plugin', 'typescript-eslint'],
    recommendedPreset: () => require('typescript-eslint').configs.strictTypeChecked,
  },
  {
    id: 'unicorn',
    label: 'unicorn',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () => pluginRules(unicornPlugin, 'unicorn'),
    packages: ['eslint-plugin-unicorn'],
    recommendedPreset: () => [unicornPlugin.configs.recommended],
  },
  {
    id: 'regexp',
    label: 'regexp',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () => pluginRules(regexpPlugin, 'regexp'),
    packages: ['eslint-plugin-regexp'],
    recommendedPreset: () => asArray(regexpPlugin.configs?.['flat/recommended']),
  },
  {
    id: 'imports',
    label: 'imports',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () => [...pluginRules(importXPlugin, 'import-x'), ...pluginRules(unusedImportsPlugin, 'unused-imports')],
    packages: ['eslint-plugin-import-x', 'eslint-plugin-unused-imports'],
    recommendedPreset: () => asArray(importXFlatConfigs?.recommended),
  },
  {
    id: 'perfectionist',
    label: 'perfectionist',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () => pluginRules(perfectionistPlugin, 'perfectionist'),
    packages: ['eslint-plugin-perfectionist'],
    // perfectionist ships no default preset — every rule is opt-in, so
    // everything shows as "needs action".
    recommendedPreset: () => [{ plugins: { perfectionist: perfectionistPlugin }, rules: {} }],
  },
  {
    id: 'comments',
    label: 'eslint-comments',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () => pluginRules(commentsPlugin, '@eslint-community/eslint-comments'),
    packages: ['@eslint-community/eslint-plugin-eslint-comments'],
    recommendedPreset: () => [
      {
        plugins: { '@eslint-community/eslint-comments': commentsPlugin },
        rules: commentsPlugin.configs?.recommended?.rules ?? {},
      },
    ],
  },
  {
    id: 'jsdoc',
    label: 'jsdoc',
    probe: 'probe.js',
    unicuteOptions: {},
    enumerate: () => pluginRules(jsdocPlugin, 'jsdoc'),
    packages: ['eslint-plugin-jsdoc'],
    recommendedPreset: () => asArray(jsdocPlugin.configs?.['flat/recommended']),
  },
  {
    id: 'node',
    label: 'node',
    probe: 'probe.js',
    unicuteOptions: { node: true },
    enumerate: () => pluginRules(nPlugin, 'n'),
    packages: ['eslint-plugin-n'],
    recommendedPreset: () => asArray(nPlugin.configs?.['flat/recommended']),
  },
  {
    id: 'testing',
    label: 'testing (vitest + no-only-tests)',
    probe: 'probe.test.ts',
    unicuteOptions: { vitest: true },
    enumerate: () => [...pluginRules(noOnlyTestsPlugin, 'no-only-tests'), ...pluginRules(vitestPlugin, 'vitest')],
    packages: ['eslint-plugin-no-only-tests', '@vitest/eslint-plugin'],
    // no-only-tests has no preset; vitest recommended covers everything else.
    recommendedPreset: () => [
      {
        plugins: { 'no-only-tests': noOnlyTestsPlugin, vitest: vitestPlugin },
        rules: vitestPlugin.configs?.recommended?.rules ?? {},
      },
    ],
  },
  {
    id: 'react',
    label: 'react',
    probe: 'probe.tsx',
    unicuteOptions: { react: true },
    enumerate: () => pluginRules(reactPlugin, '@eslint-react'),
    packages: ['@eslint-react/eslint-plugin'],
    recommendedPreset: () => {
      const rec = reactPlugin.configs?.recommended
      return rec ? [rec] : []
    },
  },
  {
    id: 'jsx-a11y',
    label: 'react a11y',
    probe: 'probe.tsx',
    unicuteOptions: { react: { a11y: true } },
    enumerate: () => pluginRules(jsxA11yPlugin, 'jsx-a11y'),
    packages: ['eslint-plugin-jsx-a11y'],
    recommendedPreset: () => {
      const rec = jsxA11yPlugin.flatConfigs?.recommended ?? jsxA11yPlugin.configs?.recommended
      return rec ? [rec] : []
    },
  },
  {
    id: 'vue',
    label: 'vue',
    probe: 'probe.vue',
    unicuteOptions: { vue: true },
    enumerate: () => pluginRules(vuePlugin, 'vue'),
    packages: ['eslint-plugin-vue'],
    recommendedPreset: () => asArray(vuePlugin.configs?.['flat/recommended']),
  },
  {
    id: 'vuejs-accessibility',
    label: 'vue a11y',
    probe: 'probe.vue',
    unicuteOptions: { vue: { a11y: true } },
    enumerate: () => pluginRules(vueA11yPlugin, 'vuejs-accessibility'),
    packages: ['eslint-plugin-vuejs-accessibility'],
    recommendedPreset: () => asArray(vueA11yPlugin.configs?.['flat/recommended']),
  },
  {
    id: 'svelte',
    label: 'svelte (incl. a11y)',
    probe: 'probe.svelte',
    unicuteOptions: { svelte: { a11y: true } },
    enumerate: () => pluginRules(sveltePlugin, 'svelte'),
    packages: ['eslint-plugin-svelte'],
    recommendedPreset: () => asArray(sveltePlugin.configs?.recommended),
  },
  {
    id: 'tailwind',
    label: 'tailwindcss',
    probe: 'probe.tsx',
    unicuteOptions: { tailwindcss: true },
    enumerate: () => pluginRules(tailwindPlugin, 'tailwindcss'),
    packages: ['eslint-plugin-tailwindcss'],
    recommendedPreset: () => asArray(tailwindPlugin.configs?.['flat/recommended']),
  },
  {
    id: 'jsonc',
    label: 'jsonc',
    probe: 'probe.jsonc',
    unicuteOptions: {},
    enumerate: () => pluginRules(jsoncPlugin, 'jsonc'),
    packages: ['eslint-plugin-jsonc'],
    recommendedPreset: () => asArray(jsoncConfigs?.['flat/recommended-with-jsonc']),
  },
  {
    id: 'yaml',
    label: 'yaml',
    probe: 'probe.yaml',
    unicuteOptions: {},
    enumerate: () => pluginRules(ymlPlugin, 'yml'),
    packages: ['eslint-plugin-yml'],
    recommendedPreset: () => asArray(ymlConfigs?.['flat/standard']),
  },
  {
    id: 'toml',
    label: 'toml',
    probe: 'probe.toml',
    unicuteOptions: {},
    enumerate: () => pluginRules(tomlPlugin, 'toml'),
    packages: ['eslint-plugin-toml'],
    recommendedPreset: () => asArray(tomlConfigs?.['flat/standard']),
  },
  {
    id: 'pnpm',
    label: 'pnpm workspace',
    // pnpm/json-* → package.json, pnpm/yaml-* → pnpm-workspace.yaml. Probe
    // both; rules are merged across probes (see probeAll).
    probe: ['package.json', 'pnpm-workspace.yaml'],
    unicuteOptions: { pnpm: true },
    enumerate: () => pluginRules(pnpmPlugin, 'pnpm'),
    packages: ['eslint-plugin-pnpm'],
    recommendedPreset: () => [...asArray(pnpmConfigs?.json), ...asArray(pnpmConfigs?.yaml)],
  },
]

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Minimal parser / language setup for a recommended-only probe. We reach
 * into the full unicute config and pull out language-option blocks relevant
 * to the probe file — that way .tsx gets JSX, .vue gets vue-eslint-parser,
 * etc., without re-encoding the whole setup matrix here.
 */
function recommendedSetupBlocks(category) {
  const blocks = unicute(category.unicuteOptions).filter((b) => {
    // Keep blocks that define languageOptions or the JSX parser toggle but
    // no rules (rules come from the plugin recommended preset itself).
    if (!b || b.rules) return false
    if (b.languageOptions || b.processor) return true
    return false
  })
  return blocks
}

function pluginRules(plugin, prefix) {
  const out = []
  for (const [name, rule] of Object.entries(plugin.rules ?? {})) {
    const id = `${prefix}/${name}`
    out.push({ id, meta: extractMeta(rule, id) })
  }
  return out
}

/**
 * Global rule-meta index built from every category's `enumerate()`. Keyed by
 * rule ID; records the meta plus which category is the rule's "native" home.
 * Used so that a rule can appear in another category's JSON (user-driven
 * scope override) and still carry docs/schema info from its native plugin.
 */
const GLOBAL_RULE_META = (() => {
  const out = {}
  for (const cat of CATEGORIES) {
    for (const { id, meta } of cat.enumerate()) {
      if (!out[id]) out[id] = { ...meta, nativeCategory: cat.id }
    }
  }
  return out
})()

// ─── probing ──────────────────────────────────────────────────────────────

/**
 * ESLint's flat-config validator throws `Invalid Options:` with a multi-line
 * JSON-Schema dump when a rule's options don't match its schema. The useful
 * signal — *which* rule, *which* option — is buried in that wall of text.
 * This extracts it and points the user at the rule-diff/*.json most likely
 * to contain the stale entry, so the fix is one edit away.
 *
 * Falls back to the raw first line if the error shape doesn't match (e.g.
 * the parser module is missing, or a plugin is unregistered).
 */
function summarizeProbeError(error, categoryId) {
  const raw = error?.message ?? String(error)
  const ruleMatch = raw.match(/Key "rules":\s*Key "([^"]+)"/)
  const propMatch = raw.match(/Unexpected property "([^"]+)"/)
  const expectedMatch = raw.match(/Expected properties:\s*([^\s.][^.]*)\./)
  const shouldNotHave = /should NOT have additional properties/.test(raw)
  if (ruleMatch && (propMatch || shouldNotHave)) {
    const rule = ruleMatch[1]
    const badProp = propMatch?.[1]
    const expected = expectedMatch
      ? expectedMatch[1]
          .replace(/"/g, '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const homes = findRuleInOverrides(rule)
    const where = homes.length ? homes.map((f) => `rule-diff/${f}`).join(' / ') : `rule-diff/${categoryId}.json`
    const fix = badProp
      ? `unknown option "${badProp}"${expected.length ? ` (expected one of: ${expected.join(', ')})` : ''}`
      : `options don't match the rule's schema`
    return {
      badProperty: badProp ?? null,
      expected,
      file: where,
      rule,
      summary: `${rule}: ${fix} — fix in ${where}`,
      type: 'option-invalid',
    }
  }
  return { summary: raw.split('\n')[0].slice(0, 240), type: 'probe-failed' }
}

/** Scan rule-diff/*.json for the rule id and return a list of matching files
 *  (sans path). Used to point the user at the exact file to edit. */
function findRuleInOverrides(ruleId) {
  if (!existsSync(OUT)) return []
  const hits = []
  for (const entry of readdirSync(OUT)) {
    if (!entry.endsWith('.json') || entry.startsWith('.')) continue
    try {
      const content = JSON.parse(readFileSync(join(OUT, entry), 'utf8'))
      if (content && typeof content === 'object' && Object.hasOwn(content, ruleId)) {
        hits.push(entry)
      }
    } catch {
      // Ignore unreadable / malformed JSON — the user will see other errors.
    }
  }
  return hits
}

async function probeConfigFor(config, probeFile) {
  // calculateConfigForFile can return null when the file matches no config
  // block. For our purposes that's the same as "no rules applied".
  const eslint = new ESLint({
    cwd: PROBE_DIR,
    overrideConfig: config,
    overrideConfigFile: true,
  })
  const result = await eslint.calculateConfigForFile(join(PROBE_DIR, probeFile))
  return result ?? {}
}

/**
 * Probe one or more files against the same config and merge the rule sets.
 * For a category spanning multiple file types (pnpm's `package.json` +
 * `pnpm-workspace.yaml`), we want the union of rule levels — whichever
 * file the rule is defined against.
 */
async function probeAll(config, probes) {
  const files = Array.isArray(probes) ? probes : [probes]
  const merged = {}
  for (const f of files) {
    const probed = await probeConfigFor(config, f)
    for (const [id, ruleLevel] of Object.entries(probed.rules ?? {})) {
      // Prefer non-off levels if seen across files — `off` in one file and
      // `error` in another is almost always a scope difference, and the
      // active rule is the more informative display.
      if (merged[id] === undefined) merged[id] = ruleLevel
      else if (levelOf(merged[id]) === 'off' && levelOf(ruleLevel) !== 'off') merged[id] = ruleLevel
    }
  }
  return { rules: merged }
}

function levelOf(value) {
  return level(value)
}

// ─── reference configs ────────────────────────────────────────────────────

/**
 * Each ref registers plugins under whatever prefix it prefers. Before we can
 * cross-reference their rules against unicute's canonical names, collapse
 * the ref-side prefix to ours. Per-rule semantic aliases (e.g.
 * `@eslint-react/jsx-key-before-spread` ↔ `react/jsx-key`) still live in
 * `rule-equivalence.js` — this handles the 1:1 prefix-rename case only.
 */
const REF_PREFIX_RENAMES = {
  antfu: [
    ['ts/', '@typescript-eslint/'],
    ['node/', 'n/'],
    ['test/', 'vitest/'],
    ['yaml/', 'yml/'],
    ['eslint-comments/', '@eslint-community/eslint-comments/'],
    ['import/', 'import-x/'],
    // antfu's `style/*` is @stylistic — no corresponding unicute category,
    // leave as-is so it doesn't accidentally collide with anything.
  ],
  sxzz: [
    ['node/', 'n/'],
    ['import/', 'import-x/'],
  ],
  airbnb: [
    // airbnb-extended uses `import-x/*` and `@typescript-eslint/*` natively.
    // But `@vue/eslint-config-airbnb` (layered in for .vue files) uses the
    // legacy `import/*` and `react/*` — collapse to our canonical prefix.
    ['import/', 'import-x/'],
  ],
  standard: [
    // neostandard uses @typescript-eslint and plain core rules — no renames
    // needed.
  ],
}

function renameRulesPrefix(rules, renames) {
  if (!renames || renames.length === 0) return rules
  const out = {}
  for (const [key, value] of Object.entries(rules)) {
    let remapped = key
    for (const [from, to] of renames) {
      if (key.startsWith(from)) {
        remapped = to + key.slice(from.length)
        break
      }
    }
    // Preserve both names — the canonical one takes priority, but keep the
    // original too so an exact match on the ref's own rule ID still works
    // if it happened to coincide with a unicute rule.
    out[remapped] = value
    if (remapped !== key && !(key in out)) out[key] = value
  }
  return out
}

async function loadRefs() {
  const refs = {}

  // antfu's config uses `ensurePackages` which prompts interactively for
  // optional features (react-refresh, next plugin, etc.). Setting CI=1
  // short-circuits that path — we only probe what's already installed.
  process.env.CI = '1'

  // antfu — pin `autoRenamePlugins: false` so rules come under antfu's
  // internal plugin names (ts/*, node/*, test/*, yaml/*, eslint-comments/*,
  // import/*, style/*). We translate those back to unicute's canonical
  // prefixes via REF_PREFIX_RENAMES so alias resolution finds them.
  // react/svelte stay off — they require peer plugins (react-refresh) we
  // don't carry as dependencies.
  try {
    const { default: antfu } = await import('@antfu/eslint-config')
    const pkg = require('@antfu/eslint-config/package.json')
    const config = await antfu({
      autoRenamePlugins: false,
      javascript: true,
      jsonc: true,
      markdown: true,
      pnpm: true,
      react: false,
      svelte: false,
      toml: true,
      typescript: true,
      vue: true,
      yaml: true,
    })
    refs.antfu = {
      config,
      packages: [{ name: '@antfu/eslint-config', version: pkg.version }],
      version: pkg.version,
    }
  } catch (error) {
    console.warn('[refs] antfu unavailable:', error.message)
  }

  // sxzz — `enableVue` defaults to `isPackageExists('vue'|'nuxt'|…)`, and
  // unicute's repo doesn't include any of those as dependencies, so we have
  // to force it on. Same for pnpm (default off).
  try {
    const { sxzz } = await import('@sxzz/eslint-config')
    const pkg = require('@sxzz/eslint-config/package.json')
    refs.sxzz = {
      config: await sxzz({ pnpm: true, vue: true }),
      packages: [{ name: '@sxzz/eslint-config', version: pkg.version }],
      version: pkg.version,
    }
  } catch (error) {
    console.warn('[refs] sxzz unavailable:', error.message)
  }

  // standard (neostandard). Also layer in `@vue/eslint-config-standard`
  // scoped to *.vue so the `vue` category actually compares against
  // "standard + vue", not just neostandard (which doesn't cover vue).
  try {
    const { default: neostandard } = await import('neostandard')
    const pkg = require('neostandard/package.json')
    const packages = [{ name: 'neostandard', version: pkg.version }]
    const base = neostandard({ noStyle: false, ts: true })
    let vueBlocks = []
    try {
      const { default: vueStandard } = await import('@vue/eslint-config-standard')
      const vuePkg = require('@vue/eslint-config-standard/package.json')
      packages.push({ name: '@vue/eslint-config-standard', version: vuePkg.version })
      // vue-standard re-registers `import-x` / `n` / `promise` / `@stylistic`
      // that neostandard already has, which ESLint 10 flat config rejects as
      // duplicate plugin registrations. Strip the `plugins` key from its
      // blocks — the rule IDs still resolve through neostandard's
      // registration. Add the `vue` plugin ourselves (vue-standard omits it).
      vueBlocks = [
        { files: ['**/*.vue'], plugins: { vue: vuePlugin } },
        ...vueStandard.map(({ plugins, ...rest }) => ({ ...rest, files: rest.files ?? ['**/*.vue'] })),
      ]
    } catch (error) {
      console.warn('[refs] @vue/eslint-config-standard unavailable:', error.message)
    }
    refs.standard = { config: [...base, ...vueBlocks], packages, version: pkg.version }
  } catch (error) {
    console.warn('[refs] standard unavailable:', error.message)
  }

  // airbnb — `eslint-config-airbnb-extended` is flat-native. Its configs
  // reference plugins (import-x, react, …) without registering them, so
  // we prepend the ready-made `plugins` export blocks.
  //
  // airbnb-extended has no native vue support, but `@vue/eslint-config-airbnb`
  // does exist in the legacy (.eslintrc) format — convert via FlatCompat,
  // register the plugins it needs, and scope everything to `**/*.vue` so
  // other categories aren't polluted.
  try {
    const airbnb = await import('eslint-config-airbnb-extended')
    const pkg = require('eslint-config-airbnb-extended/package.json')
    const packages = [{ name: 'eslint-config-airbnb-extended', version: pkg.version }]
    const pluginBlocks = Object.values(airbnb.plugins)

    // airbnb-extended's react.all blocks scope via `files: allFiles` — every
    // JS/TS extension, not JSX-only. So their React-flavored overrides
    // (`class-methods-use-this` with React lifecycle exceptMethods, Redux
    // devtools allowance in `no-underscore-dangle`, etc.) apply to plain
    // `.js`/`.ts` too. That IS how airbnb behaves. Don't try to narrow it
    // here — the dashboard's job is to show what the reference config
    // actually does, not a cleaned-up version. If the React flavor surfaces
    // on a core rule under `javascript`, that's accurate information the
    // user should see when comparing.
    const config = [
      ...pluginBlocks,
      ...airbnb.configs.base.all,
      ...airbnb.configs.react.all,
      ...airbnb.configs.node.recommended,
    ]

    // vue add-on
    try {
      const reactPluginLegacy = (await import('eslint-plugin-react')).default
      const importPlugin = await import('eslint-plugin-import')
      const vueAirbnbPath = require.resolve('@vue/eslint-config-airbnb/package.json')

      const vueAirbnbPkg = require(vueAirbnbPath)
      packages.push({ name: '@vue/eslint-config-airbnb', version: vueAirbnbPkg.version })
      const compat = new FlatCompat({ baseDirectory: resolve(vueAirbnbPath, '..') })
      const converted = compat.extends('@vue/eslint-config-airbnb')
      // Register every plugin vue-airbnb references so calculateConfigForFile
      // can validate the rule IDs. `import`/`react` are legacy plugins we
      // install as devDeps purely for this probe.
      config.push({
        files: ['**/*.vue'],
        plugins: {
          import: importPlugin.default ?? importPlugin,
          'jsx-a11y': jsxA11yPlugin,
          react: reactPluginLegacy,
          vue: vuePlugin,
          'vuejs-accessibility': vueA11yPlugin,
        },
      })
      for (const block of converted) {
        config.push({ ...block, files: block.files ?? ['**/*.vue'] })
      }
    } catch (error) {
      console.warn('[refs] @vue/eslint-config-airbnb unavailable:', error.message)
    }

    refs.airbnb = { config, packages, version: pkg.version }
  } catch (error) {
    console.warn('[refs] airbnb unavailable:', error.message)
  }

  return refs
}

// ─── rule-diff JSON I/O ───────────────────────────────────────────────────

function loadDecisions(categoryId) {
  const path = join(OUT, `${categoryId}.json`)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

function saveDecisions(categoryId, data) {
  const path = join(OUT, `${categoryId}.json`)
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

// ─── baseline ─────────────────────────────────────────────────────────────

const BASELINE_PATH = join(OUT, '.baseline.json')

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Drift = the upstream has changed in ways that might invalidate previous
 * unicute decisions. We compare the *current* snapshot against whatever was
 * true the last time a decision was saved (`rule-diff/.baseline.json`).
 *
 * Only flag genuine changes:
 *   - plugin version bumped between runs
 *   - recommended level changed for a rule we already tracked
 *   - rule newly deprecated upstream
 *   - rule retired upstream (was tracked, now gone)
 *   - new rule in a tracked category with a tracked plugin version
 *   - ref alias no longer resolves
 *
 * We do NOT flag:
 *   - a category that's absent from the baseline (the baseline is partial
 *     for that category — every rule would look "new", which is noise)
 *   - a plugin whose version isn't in the baseline (same reasoning)
 *
 * In other words: if a part of the upstream wasn't baselined last time, the
 * first baseline sync is implicit — not "drift". Drift is strictly a
 * change-detection signal.
 */
function computeDrift(current, baseline) {
  const alerts = []

  // Surface any probe failures first — they're the loudest signal the user
  // can act on, and they also explain subsequent alias-lost suppression.
  // These aren't drift in the "upstream moved" sense; we piggyback on the
  // drift channel because it's what the dashboard already renders at top.
  //
  // Dedupe: one bad option in rule-diff/typescript.json causes the
  // @typescript-eslint validator to reject every probe that loads TS rules
  // (typescript + testing + react + jsx-a11y + vue + vuejs-a11y + svelte +
  // tailwind = 8 failures, all from the same root cause). Collapse by
  // (type, rule, badProperty, file) and list the affected categories in
  // the message.
  const failureGroups = new Map()
  for (const f of current.probeFailures ?? []) {
    const key = `${f.type}|${f.rule ?? ''}|${f.badProperty ?? ''}|${f.file ?? ''}`
    const g = failureGroups.get(key) ?? { failure: f, categories: [] }
    g.categories.push(f.category)
    failureGroups.set(key, g)
  }
  for (const { categories, failure } of failureGroups.values()) {
    const where =
      categories.length > 1 ? ` (blocks ${categories.length} category probes: ${categories.join(', ')})` : ''
    alerts.push({
      categories,
      message:
        failure.type === 'option-invalid'
          ? `${failure.rule} has an invalid option${failure.badProperty ? ` "${failure.badProperty}"` : ''} in ${failure.file}${failure.expected?.length ? ` — expected one of: ${failure.expected.join(', ')}` : ''}${where}`
          : `probe failed: ${failure.summary}${where}`,
      rule: failure.rule ?? null,
      type: failure.type,
    })
  }

  if (!baseline) return alerts

  const trackedCategories = new Set(Object.keys(baseline.rules ?? {}))
  const trackedPlugins = new Set(Object.keys(baseline.plugins ?? {}))
  const failedCategories = current.failedCategories ?? new Set()

  // Rule discovery (new-rule / rule-retired) only makes sense when the
  // plugin that owns the category actually changed version — otherwise the
  // baseline is just out of sync with the current rule universe, not a
  // genuine upstream event. Build category → pkgs-changed lookup.
  const categoryPkgChanged = new Map()
  for (const cat of CATEGORIES) {
    const changed = cat.packages.some((p) => {
      const prev = baseline.plugins?.[p]
      const cur = current.plugins[p]
      return prev?.version && cur?.version && prev.version !== cur.version
    })
    categoryPkgChanged.set(cat.id, changed)
  }

  // Plugin version bumps (only for plugins we tracked before).
  for (const [pkg, info] of Object.entries(current.plugins)) {
    if (!trackedPlugins.has(pkg)) continue
    const prev = baseline.plugins[pkg]
    if (prev?.version && prev.version !== info.version) {
      alerts.push({
        from: prev.version,
        message: `${pkg} upgraded (${prev.version} → ${info.version}) — review rule changes below.`,
        pkg,
        to: info.version,
        type: 'plugin-upgraded',
      })
    }
  }

  // Rule-level drift, only for tracked categories.
  //
  // Skip foreign rules (rules whose native category is a different one).
  // `recommended` / `deprecated` are plugin-level properties, not
  // category-level — the value we see for a rule in a non-native category
  // is whatever that category's `recommendedPreset()` happens to emit,
  // which is typically null/undefined because cross-plugin rules aren't
  // part of the category's preset. That produces false "recommended-changed"
  // alerts when a user moves a rule into another category's JSON (e.g.
  // disabling `jsdoc/require-jsdoc` on typescript-scoped files).
  // Drift about the rule's upstream behavior is tracked in its native
  // category's entry — one authoritative source is enough.
  for (const [catId, rules] of Object.entries(current.rules)) {
    if (!trackedCategories.has(catId)) continue // not baselined yet → quiet
    const pkgChanged = categoryPkgChanged.get(catId) ?? false
    const prevRules = baseline.rules[catId]
    for (const [ruleId, r] of Object.entries(rules)) {
      const nativeCategory = GLOBAL_RULE_META[ruleId]?.nativeCategory
      const isForeign = nativeCategory && nativeCategory !== catId
      if (isForeign) continue
      const prev = prevRules[ruleId]
      if (!prev) {
        // "New rule" only counts as drift when the owning plugin was
        // actually upgraded. Otherwise the baseline is just stale
        // (partial), not the upstream moving.
        if (pkgChanged) {
          alerts.push({
            category: catId,
            message: `new rule: ${ruleId} (recommended: ${r.recommended ?? 'n/a'})`,
            rule: ruleId,
            type: 'new-rule',
          })
        }
        continue
      }
      if (prev.recommended !== r.recommended) {
        alerts.push({
          category: catId,
          from: prev.recommended,
          message: `recommended level changed: ${ruleId} (${prev.recommended ?? 'n/a'} → ${r.recommended ?? 'n/a'})`,
          rule: ruleId,
          to: r.recommended,
          type: 'recommended-changed',
        })
      }
      if (!prev.deprecated && r.deprecated) {
        alerts.push({
          category: catId,
          message: `rule deprecated upstream: ${ruleId}`,
          rule: ruleId,
          type: 'deprecated',
        })
      }
    }
    for (const ruleId of Object.keys(prevRules)) {
      const nativeCategory = GLOBAL_RULE_META[ruleId]?.nativeCategory
      if (nativeCategory && nativeCategory !== catId) continue
      if (!(ruleId in rules) && pkgChanged) {
        // Same rationale: a rule vanishing from the baseline universe is
        // only "retired upstream" if the plugin actually moved. Partial
        // baselines shouldn't produce phantom retirements.
        alerts.push({
          category: catId,
          message: `rule retired upstream: ${ruleId}`,
          rule: ruleId,
          type: 'rule-retired',
        })
      }
    }
  }

  // Lost ref aliases (only if the ref was in the baseline at all). Skip rules
  // whose native category failed to probe this run — those aliases aren't
  // *lost*, we just couldn't evaluate them. Without this guard, a single
  // bad option in `rule-diff/typescript.json` cascades into dozens of
  // alias-lost alerts across unrelated refs.
  for (const [refName, info] of Object.entries(baseline.refs ?? {})) {
    const currentRefAliases = current.refs[refName]?.resolvedAliases ?? {}
    for (const [unicuteRule, alias] of Object.entries(info.resolvedAliases ?? {})) {
      const nativeCategory = GLOBAL_RULE_META[unicuteRule]?.nativeCategory
      if (nativeCategory && failedCategories.has(nativeCategory)) continue
      if (currentRefAliases[unicuteRule] !== alias) {
        alerts.push({
          alias,
          message: `${refName}: alias lost for ${unicuteRule} → ${alias} (no longer resolves)`,
          ref: refName,
          rule: unicuteRule,
          type: 'alias-lost',
        })
      }
    }
  }

  return alerts
}

// ─── payload build ────────────────────────────────────────────────────────

function pluginVersions() {
  const pkg = require(join(ROOT, 'package.json'))
  const out = {}
  for (const cat of CATEGORIES) {
    for (const p of cat.packages) {
      if (!out[p]) {
        try {
          const m = require(`${p}/package.json`)
          out[p] = m.version
        } catch {
          out[p] = null
        }
      }
    }
  }
  out.eslint = pkg.dependencies?.eslint ?? pkg.devDependencies?.eslint ?? 'unknown'
  try {
    out.eslint = require('eslint/package.json').version
  } catch {
    /* ignore */
  }
  return out
}

/**
 * Rules whose unicute decision is set in `src/configs/*.js` rather than
 * `rule-diff/*.json` (options typically come from a library). The
 * dashboard renders them read-only with a "managed in code" badge —
 * the decision exists, it just lives in a different file. Changing it
 * means editing the source, not the JSON.
 *
 * Keep this list in sync with the corresponding block in `src/configs/`.
 */
const CODE_MANAGED_RULES = new Set([
  // src/configs/javascript.js — enabled with `confusing-browser-globals`
  'no-restricted-globals',
  // src/configs/vue.js — require `<script lang="ts">` (or `"tsx"` when
  // sfcTsx is enabled on that file). Option shape depends on the SFC's
  // scope, so the decision lives in code rather than rule-diff JSON.
  'vue/block-lang',
])

async function probeCategory(category, refs) {
  // Two unicute probes: one with overrides (= current effective state), and
  // one with just the plugin's recommended preset (= plugin's own opinion,
  // which is what "recommended" really means — independent of any unicute
  // decision we've already committed).
  const unicuteConfig = unicute(category.unicuteOptions)
  const unicuteProbed = await probeAll(unicuteConfig, category.probe)
  const unicuteRules = unicuteProbed.rules

  let recRules = {}
  try {
    const recConfig = category.recommendedPreset()
    if (recConfig && recConfig.length > 0) {
      // Some presets (e.g. @eslint-react's recommended) ship no `files`
      // glob, no parser, nothing that tells ESLint how to read the probe.
      // Prepend a minimal setup block so calculateConfigForFile actually
      // matches probe.tsx / .vue / .svelte / etc.
      const recProbed = await probeAll([...recommendedSetupBlocks(category), ...recConfig], category.probe)
      recRules = recProbed.rules
    }
  } catch (error) {
    console.warn(`[rec] ${category.id} recommended probe failed: ${error.message}`)
  }

  const refRulesByName = {}
  for (const [refName, ref] of Object.entries(refs)) {
    try {
      const probed = await probeAll(ref.config, category.probe)
      refRulesByName[refName] = renameRulesPrefix(probed.rules, REF_PREFIX_RENAMES[refName])
    } catch (error) {
      console.warn(`[refs] ${refName} probe failed on ${category.probe}: ${error.message}`)
      refRulesByName[refName] = {}
    }
  }

  const decisions = loadDecisions(category.id)
  const rules = []
  const nativeIds = new Set()

  const buildRule = (id, meta, isForeign) => {
    const unicuteEntry = unicuteRules[id]
    const recEntry = recRules[id]
    const decision = decisions[id] ?? null
    const refsForRule = {}
    for (const refName of Object.keys(refs)) {
      refsForRule[refName] = resolveRef(id, refRulesByName[refName])
    }
    return {
      baseRuleName: meta.baseRuleName,
      decision,
      deprecated: meta.deprecated,
      description: meta.description,
      extendsBaseRule: meta.extendsBaseRule,
      // `codeManaged: true` — the rule's wiring lives in `src/configs/*.js`
      // (e.g. no-restricted-globals fed by confusing-browser-globals). The
      // dashboard renders it read-only.
      codeManaged: CODE_MANAGED_RULES.has(id) || undefined,
      // `foreign: true` + `nativeCategory` means the rule was pulled into
      // this category's JSON by the user. Dashboard renders a badge + a
      // remove-from-here button.
      foreign: isForeign || undefined,
      id,
      nativeCategory: isForeign ? meta.nativeCategory : undefined,
      recommended: level(recEntry),
      recommendedOptions: optionsOf(recEntry),
      recommendedTiers: meta.recommendedTiers,
      refs: refsForRule,
      requiresTypeChecking: meta.requiresTypeChecking,
      schema: meta.schema,
      supersededBy: SUPERSEDED_BY[id] ?? [],
      supersedes: SUPERSEDES[id] ?? [],
      unicuteLevel: level(unicuteEntry),
      unicuteOptions: optionsOf(unicuteEntry),
      url: meta.url,
    }
  }

  // Native rules from the category's own plugin enumeration.
  for (const { id, meta } of category.enumerate()) {
    nativeIds.add(id)
    rules.push(buildRule(id, meta, false))
  }

  // Foreign rules — rule IDs present in this category's JSON that aren't
  // native to the category. Probe data for them is this category's scope
  // (makes sense: if the user pulled `class-methods-use-this` into `react`,
  // they want to see how it behaves on .jsx/.tsx probes). Meta comes from
  // the rule's native plugin so docs URLs etc. still work.
  for (const id of Object.keys(decisions)) {
    if (nativeIds.has(id)) continue
    const meta = GLOBAL_RULE_META[id]
    if (!meta) continue // unknown rule — skip silently (typo, removed plugin)
    rules.push(buildRule(id, meta, true))
  }

  rules.sort((a, b) => a.id.localeCompare(b.id))

  return {
    id: category.id,
    label: category.label,
    probe: category.probe,
    rules,
    unicuteOptions: category.unicuteOptions,
  }
}

// ─── HTML ─────────────────────────────────────────────────────────────────

function toHtml(payload) {
  const template = readFileSync(join(HERE, 'dashboard.html'), 'utf8')
  const json = JSON.stringify(payload).replaceAll('<', String.raw`\u003c`)
  return template.replace('__DATA__', () => json)
}

// ─── main ─────────────────────────────────────────────────────────────────

setupProbeDir()
console.log('Loading reference configs…')
const refs = await loadRefs()

const refVersions = {}
const refPackages = {}
for (const [n, r] of Object.entries(refs)) {
  refVersions[n] = r.version
  // Most refs are multi-package (standard = neostandard + @vue/eslint-config-standard,
  // airbnb = eslint-config-airbnb-extended + @vue/eslint-config-airbnb). Fall
  // back to a single-entry list if a ref predates the `packages` field.
  refPackages[n] = r.packages ?? [{ name: n, version: r.version }]
}

console.log('Probing unicute + refs per category…')
const categoryPayload = []
const probeFailures = []
for (const cat of CATEGORIES) {
  process.stdout.write(`  · ${cat.id} `)
  try {
    categoryPayload.push(await probeCategory(cat, refs))
    process.stdout.write('\n')
  } catch (error) {
    const info = summarizeProbeError(error, cat.id)
    probeFailures.push({ category: cat.id, ...info })
    process.stdout.write(` ✗ ${info.summary}\n`)
  }
}

const pkgVersions = pluginVersions()
const current = {
  plugins: Object.fromEntries(Object.entries(pkgVersions).map(([k, v]) => [k, { version: v }])),
  refs: Object.fromEntries(
    Object.entries(refs).map(([k, r]) => {
      const resolvedAliases = {}
      for (const cat of categoryPayload) {
        for (const rule of cat.rules) {
          const hit = rule.refs?.[k]
          if (hit?.alias) resolvedAliases[rule.id] = hit.alias
        }
      }
      return [k, { resolvedAliases, version: r.version }]
    }),
  ),
  rules: Object.fromEntries(
    categoryPayload.map((cat) => [
      cat.id,
      Object.fromEntries(cat.rules.map((r) => [r.id, { deprecated: r.deprecated, recommended: r.recommended }])),
    ]),
  ),
  // Categories that failed to probe this run — their rule set is unknown, so
  // downstream drift checks (alias-lost in particular) must suppress
  // decisions keyed by rules native to these categories.
  failedCategories: new Set(probeFailures.map((f) => f.category)),
  probeFailures,
}

/**
 * The probe result (effective levels from unicute + refs, recommended levels,
 * schemas, meta) is expensive and stable across a session — only the
 * `decision` field per rule changes as the user edits. Cache everything and
 * re-read decisions JSON on each page load so Save → refresh shows fresh
 * data without re-probing.
 */
const cachedCategories = categoryPayload

function buildPayload() {
  const categories = cachedCategories.map((cat) => {
    const decisions = loadDecisions(cat.id)
    return {
      ...cat,
      rules: cat.rules.map((r) => ({ ...r, decision: decisions[r.id] ?? null })),
    }
  })
  const baseline = loadBaseline()
  return {
    categories,
    drift: computeDrift(current, baseline),
    generatedAt: new Date().toISOString(),
    hasBaseline: baseline !== null,
    plugins: pkgVersions,
    refPackages,
    refs: refVersions,
  }
}

// Always emit a static index.html so the output is inspectable even when
// the server isn't running (useful in CI or offline review). This snapshot
// is regenerated on each HTTP GET while the server is up.
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'index.html'), toHtml(buildPayload()))

// --static <path>: write a read-only HTML snapshot to <path> and exit.
// "Read-only" means the embedded DATA carries `readOnly: true`, which the
// dashboard JS reads to hide status filters (Needs action / unicute decisions
// / Hide ignored), the Save button, header stats, and all per-rule editing
// affordances. Only `Diff with`, search, deprecated filter, and category
// navigation remain. Use for publishing the decision set as a static site.
if (STATIC_OUT) {
  const outPath = resolve(STATIC_OUT)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, toHtml({ ...buildPayload(), readOnly: true }))
  console.log(`Wrote read-only snapshot to ${outPath}`)
  process.exit(0)
}

// Summary — mirror the dashboard's `isPending` / `isDecided` buckets
// (dashboard.html) so the terminal line matches what the webpage shows.
// A rule is pending when drift flagged it OR unicute has no opinion on it
// (`unicuteLevel == null`) AND no non-pending decision; it's decided when
// it has a non-pending rule-diff entry (or is code-managed). The two
// buckets are exclusive but don't sum to totalRules — rules already
// covered by a plugin's `recommended` without an explicit unicute
// decision are neither pending nor decided.
const totalRules = cachedCategories.reduce((n, c) => n + c.rules.length, 0)
const baselineInitial = loadBaseline()
const driftInitial = computeDrift(current, baselineInitial)
const driftKeys = new Set()
for (const a of driftInitial) {
  if (a.category && a.rule) driftKeys.add(`${a.category}::${a.rule}`)
}
const rulePending = (catId, r) => {
  if (r.codeManaged) return false
  if (driftKeys.has(`${catId}::${r.id}`)) return true
  if (r.unicuteLevel !== null && r.unicuteLevel !== undefined) return false
  const d = r.decision
  return !d || d.decision === 'pending'
}
const ruleDecided = (catId, r) => {
  if (r.codeManaged) return true
  if (driftKeys.has(`${catId}::${r.id}`)) return false
  const d = r.decision
  return d && d.decision !== 'pending'
}
const pending = cachedCategories.reduce((n, c) => n + c.rules.filter((r) => rulePending(c.id, r)).length, 0)
const decided = cachedCategories.reduce((n, c) => n + c.rules.filter((r) => ruleDecided(c.id, r)).length, 0)
console.log(
  `\n${totalRules} rules across ${cachedCategories.length} categories · ${decided} decided · ${pending} pending`,
)
if (driftInitial.length > 0)
  console.log(`⚠ ${driftInitial.length} drift alert${driftInitial.length === 1 ? '' : 's'} — see dashboard`)

// ─── server ───────────────────────────────────────────────────────────────

const mimeFor = (f) =>
  f.endsWith('.html')
    ? 'text/html; charset=utf-8'
    : f.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : 'text/plain; charset=utf-8'

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))

const server = createServer(async (request, res) => {
  try {
    const url = new URL(request.url, 'http://localhost/')
    const pathname = decodeURIComponent(url.pathname)

    if (request.method === 'PUT' && pathname.startsWith('/rule-diff/')) {
      const file = pathname.slice('/rule-diff/'.length)
      const match = /^\.?([\w-]+)\.json$/.exec(file)
      if (!match) {
        res.writeHead(400)
        res.end('bad category')
        return
      }
      const categoryId = file.startsWith('.') ? `.${match[1]}` : match[1]
      const chunks = []
      for await (const c of request) chunks.push(c)
      const body = Buffer.concat(chunks).toString('utf8')
      let data
      try {
        data = JSON.parse(body)
      } catch (error) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end(`bad JSON: ${error.message}`)
        return
      }
      if (categoryId === '.baseline') {
        writeFileSync(BASELINE_PATH, `${JSON.stringify(data, null, 2)}\n`)
      } else if (CATEGORY_IDS.has(categoryId)) {
        saveDecisions(categoryId, data)
      } else {
        res.writeHead(404)
        res.end('unknown category')
        return
      }
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }

    if (request.method !== 'GET') {
      res.writeHead(405)
      res.end('method not allowed')
      return
    }

    // Dashboard root — regenerate so decisions saved this session are
    // visible after a plain browser refresh. Probe data is cached; we just
    // re-read rule-diff/*.json per request.
    if (pathname === '/' || pathname === '/index.html') {
      const html = toHtml(buildPayload())
      writeFileSync(join(OUT, 'index.html'), html)
      res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    const target = pathname.replace(/^\//, '')
    const full = join(OUT, target)
    if (!full.startsWith(OUT)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    if (!existsSync(full)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': mimeFor(full) })
    res.end(readFileSync(full))
  } catch (error) {
    res.writeHead(500)
    res.end(`error: ${error.message}`)
  }
})

function startServer(port, triesLeft = 10) {
  const onListening = () => {
    server.off('error', onError) // eslint-disable-line no-use-before-define -- co-recursive handlers
    console.log(`\nServing at http://localhost:${port}/  (Ctrl-C to stop)`)
  }
  const onError = (error) => {
    server.off('listening', onListening)
    if (error.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`port ${port} in use, trying ${port + 1}…`)
      startServer(port + 1, triesLeft - 1)
    } else {
      throw error
    }
  }
  server.once('error', onError)
  server.once('listening', onListening)
  server.listen(port, '127.0.0.1')
}
startServer(SERVE_PORT)
