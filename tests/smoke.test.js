/**
 * Smoke tests — one per `unicute()` option branch + a kitchen-sink.
 *
 * Goal: catch the "install unicute, run eslint, get a schema / plugin /
 * parser crash before any real rule fires" class of failure. We build an
 * `ESLint` instance with each option combo, lint the fixtures that the
 * branch scopes to, and assert no message carries `fatal: true`.
 *
 * Normal lint findings are ignored — we're testing the config's *ability*
 * to lint, not the cleanliness of the fixtures.
 */

import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, it } from 'node:test'

import { ESLint } from 'eslint'

import unicute from '../src/index.js'

// The fixture project is a sibling pnpm-workspace member (declared in the
// repo-root `pnpm-workspace.yaml`). It owns its own devDependencies
// (tailwindcss, vitest) so the main package doesn't pull them in just for
// tests.
const PROJECT = resolve(import.meta.dirname, 'fixture-project')
const FIXTURES = resolve(PROJECT, 'fixtures')

// Some plugin peer deps (notably `tailwind-api-utils`, which `eslint-plugin-
// tailwindcss` calls into) resolve their package via `local-pkg` against
// `process.cwd()` — NOT against ESLint's `cwd` constructor option. Running
// `node --test` from the repo root would leave cwd pointing at a tree that
// doesn't declare tailwindcss. Chdir once, before any test runs, so plugin
// resolutions succeed against the fixture project's own node_modules.
process.chdir(PROJECT)

function fix(name) {
  return resolve(FIXTURES, name)
}

/**
 * Build an ESLint instance scoped to the fixtures dir with the given
 * unicute options. `gitignore: false` is forced — the project's own
 * .gitignore would otherwise leak ignore patterns into fixtures/.
 */
function makeEslint(options = {}) {
  const config = unicute({ gitignore: false, prettier: false, ...options })
  return new ESLint({
    cwd: PROJECT,
    overrideConfigFile: true,
    overrideConfig: config,
    errorOnUnmatchedPattern: false,
  })
}

/**
 * Lint every fixture path; fail if any message is `fatal: true`, if the
 * eslintrc reports errored source, or if the call throws.
 */
async function assertLintsCleanly(eslint, fixtures) {
  for (const fixture of fixtures) {
    const filePath = fix(fixture)
    let results
    try {
      results = await eslint.lintFiles([filePath])
    } catch (err) {
      assert.fail(`lintFiles threw for ${fixture}: ${err.stack ?? err.message}`)
    }
    for (const result of results) {
      const fatals = (result.messages ?? []).filter((m) => m.fatal)
      if (fatals.length > 0) {
        const detail = fatals.map((m) => `  ${m.ruleId ?? '(parser)'}: ${m.message}`).join('\n')
        assert.fail(`fatal messages in ${fixture}:\n${detail}`)
      }
    }
  }
}

describe('smoke: per-option branches', () => {
  it('default — plain JS only', async () => {
    const eslint = makeEslint({ typescript: false })
    await assertLintsCleanly(eslint, ['sample.js', 'sample.mjs', 'sample.cjs'])
  })

  it('typescript: true — TS/TSX/MTS/CTS', async () => {
    const eslint = makeEslint({ typescript: true })
    await assertLintsCleanly(eslint, ['sample.ts', 'sample.mts', 'sample.cts', 'sample.tsx'])
  })

  it('react: true — JSX + TSX', async () => {
    const eslint = makeEslint({ typescript: true, react: true })
    await assertLintsCleanly(eslint, ['sample.jsx', 'sample.tsx'])
  })

  it('react: { a11y: true }', async () => {
    const eslint = makeEslint({ typescript: true, react: { a11y: true } })
    await assertLintsCleanly(eslint, ['sample.jsx', 'sample.tsx'])
  })

  // Vue has two independent bool options (sfcTsx × a11y) → 4 combinations.
  // `vue: true` is the (false, false) corner.
  it('vue: true — (sfcTsx=off, a11y=off)', async () => {
    const eslint = makeEslint({ typescript: true, vue: true })
    await assertLintsCleanly(eslint, ['component.vue'])
  })

  it('vue: { a11y: true } — (sfcTsx=off, a11y=on)', async () => {
    const eslint = makeEslint({ typescript: true, vue: { a11y: true } })
    await assertLintsCleanly(eslint, ['component.vue'])
  })

  it('vue: { sfcTsx: true } — (sfcTsx=on, a11y=off)', async () => {
    const eslint = makeEslint({ typescript: true, vue: { sfcTsx: true } })
    await assertLintsCleanly(eslint, ['component.vue', 'component-tsx.vue'])
  })

  it('vue: { sfcTsx: true, a11y: true } — (sfcTsx=on, a11y=on)', async () => {
    const eslint = makeEslint({
      typescript: true,
      vue: { a11y: true, sfcTsx: true },
    })
    await assertLintsCleanly(eslint, ['component.vue', 'component-tsx.vue'])
  })

  it('svelte: true', async () => {
    const eslint = makeEslint({ typescript: true, svelte: true })
    await assertLintsCleanly(eslint, ['component.svelte'])
  })

  it('svelte: { a11y: true }', async () => {
    const eslint = makeEslint({ typescript: true, svelte: { a11y: true } })
    await assertLintsCleanly(eslint, ['component.svelte'])
  })

  it('tailwindcss: true', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: true,
      tailwindcss: true,
    })
    await assertLintsCleanly(eslint, ['sample.tsx'])
  })

  it('vitest: true — test file', async () => {
    const eslint = makeEslint({ typescript: true, vitest: true })
    await assertLintsCleanly(eslint, ['sample.test.ts'])
  })

  it('node: true — Node globals', async () => {
    const eslint = makeEslint({ typescript: true, node: true })
    await assertLintsCleanly(eslint, ['sample.js', 'sample.ts'])
  })

  it('node: "**/*.js" — glob scope', async () => {
    const eslint = makeEslint({ typescript: true, node: '**/*.js' })
    await assertLintsCleanly(eslint, ['sample.js'])
  })

  it('jsdoc: true', async () => {
    const eslint = makeEslint({ typescript: true, jsdoc: true })
    await assertLintsCleanly(eslint, ['sample.js', 'sample.ts'])
  })

  it('pnpm: true — package.json', async () => {
    const eslint = makeEslint({ typescript: false, pnpm: true })
    await assertLintsCleanly(eslint, ['pkg/package.json'])
  })

  it('prettier: true — every format target', async () => {
    const eslint = makeEslint({ typescript: false, prettier: true })
    await assertLintsCleanly(eslint, [
      'sample.js',
      'sample.json',
      'sample.jsonc',
      'sample.yaml',
      'sample.toml',
      'sample.md',
      'sample.css',
      'sample.html',
    ])
  })

  it('prettier: { printWidth: 80 } — object variant', async () => {
    const eslint = makeEslint({
      typescript: false,
      prettier: { printWidth: 80 },
    })
    await assertLintsCleanly(eslint, ['sample.js'])
  })
})

describe('smoke: always-on file types', () => {
  it('jsonc/yaml/toml lint under minimal config', async () => {
    const eslint = makeEslint({ typescript: false })
    await assertLintsCleanly(eslint, ['sample.json', 'sample.jsonc', 'sample.yaml', 'sample.toml'])
  })

  it('commonjs override category applies to .cjs/.cts', async () => {
    const eslint = makeEslint({ typescript: true })
    await assertLintsCleanly(eslint, ['sample.cjs', 'sample.cts'])
  })
})

describe('smoke: kitchen sink (every option on)', () => {
  it('everything enabled together', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: { a11y: true },
      vue: { a11y: true, sfcTsx: true },
      svelte: { a11y: true },
      tailwindcss: true,
      vitest: true,
      node: true,
      jsdoc: true,
      pnpm: true,
      prettier: true,
    })
    await assertLintsCleanly(eslint, [
      'sample.js',
      'sample.mjs',
      'sample.cjs',
      'sample.ts',
      'sample.mts',
      'sample.cts',
      'sample.tsx',
      'sample.jsx',
      'component.vue',
      'component-tsx.vue',
      'component.svelte',
      'sample.test.ts',
      'sample.json',
      'sample.jsonc',
      'sample.yaml',
      'sample.toml',
      'sample.md',
      'sample.css',
      'sample.html',
      'pkg/package.json',
    ])
  })
})
