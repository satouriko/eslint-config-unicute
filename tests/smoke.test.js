/**
 * Smoke tests — one per `unicute()` option branch + a kitchen-sink.
 *
 * Goal: catch the "install unicute, run eslint, get a schema / plugin /
 * parser / option-shape crash" class of failure, AND verify every
 * fixture file actually gets linted (not silently ignored by the
 * `files` filter chain).
 *
 * Each fixture embeds at least one deliberate lint violation — `let`
 * never reassigned (→ prefer-const), explicit type annotation on a
 * literal (→ @typescript-eslint/no-inferrable-types), duplicate JSON
 * key, prettier-unfriendly formatting, etc. The test requires every
 * fixture to produce ≥1 message; an empty result array means the
 * `files` glob chain didn't match and the file was unlinted.
 */

import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, it } from 'node:test'

import { ESLint } from 'eslint'

import unicute from '../src/index.js'

const PROJECT = resolve(import.meta.dirname, 'fixture-project')
const FIXTURES = resolve(PROJECT, 'fixtures')

// Plugin peer-deps like `tailwind-api-utils` resolve via `local-pkg`
// against `process.cwd()`, not the ESLint constructor's `cwd`. Chdir once
// so those resolutions land inside the fixture project's node_modules.
process.chdir(PROJECT)

function fix(name) {
  return resolve(FIXTURES, name)
}

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
 * Assertions per fixture file:
 *   1. No parser / infra failure — reject `fatal: true`, error-level
 *      messages without a rule ID, or any message starting "Parsing
 *      error" (caught the svelte-as-JSX mis-parse that slipped past
 *      fatal-only filtering).
 *   2. At least one non-parser message — an empty `messages` array means
 *      the `files` filter chain in the config didn't match, so the
 *      fixture was silently skipped. Each fixture is rigged to emit at
 *      least one finding under the relevant unicute option branch.
 */
async function assertLinted(eslint, fixtures) {
  for (const fixture of fixtures) {
    const filePath = fix(fixture)
    let results
    try {
      results = await eslint.lintFiles([filePath])
    } catch (err) {
      assert.fail(`lintFiles threw for ${fixture}: ${err.stack ?? err.message}`)
    }
    for (const result of results) {
      const msgs = result.messages ?? []
      const bad = msgs.filter(
        (m) =>
          m.fatal
          || (m.severity === 2 && (m.ruleId === null || m.ruleId === undefined))
          || /^Parsing error\b/i.test(m.message ?? ''),
      )
      if (bad.length > 0) {
        const detail = bad.map((m) => `  ${m.ruleId ?? '(parser)'}: ${m.message}`).join('\n')
        assert.fail(`parser/infra failures in ${fixture}:\n${detail}`)
      }
      if (msgs.length === 0) {
        assert.fail(
          `no lint messages for ${fixture} — file was silently skipped. Either the config's `
            + `files filter didn't match, or the planted violation no longer fires.`,
        )
      }
    }
  }
}

describe('smoke: per-option branches', () => {
  it('default — plain JS only', async () => {
    const eslint = makeEslint({ typescript: false })
    await assertLinted(eslint, ['sample.js', 'sample.mjs', 'sample.cjs'])
  })

  it('typescript: true', async () => {
    const eslint = makeEslint({ typescript: true })
    await assertLinted(eslint, ['sample.ts', 'sample.mts', 'sample.cts', 'sample.tsx'])
  })

  // ── react: 4 variants ─────────────────────────────────────────────
  it('react: true', async () => {
    const eslint = makeEslint({ typescript: true, react: true })
    await assertLinted(eslint, ['sample.jsx', 'sample.tsx'])
  })

  it('react: { a11y: true }', async () => {
    const eslint = makeEslint({ typescript: true, react: { a11y: true } })
    await assertLinted(eslint, ['sample.jsx', 'sample.tsx'])
  })

  it('react: { files: glob }', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: { files: ['**/sample.jsx', '**/sample.tsx'] },
    })
    await assertLinted(eslint, ['sample.jsx', 'sample.tsx'])
  })

  it('react: { a11y: true, files: glob }', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: { a11y: true, files: ['**/sample.jsx', '**/sample.tsx'] },
    })
    await assertLinted(eslint, ['sample.jsx', 'sample.tsx'])
  })

  // ── vue: 7 meaningful variants of (sfcTsx × a11y × files) ──────────
  it('vue: true', async () => {
    const eslint = makeEslint({ typescript: true, vue: true })
    await assertLinted(eslint, ['component.vue'])
  })

  it('vue: { a11y: true }', async () => {
    const eslint = makeEslint({ typescript: true, vue: { a11y: true } })
    await assertLinted(eslint, ['component.vue'])
  })

  it('vue: { sfcTsx: true } — all .vue use lang=tsx', async () => {
    const eslint = makeEslint({ typescript: true, vue: { sfcTsx: true } })
    // Only lint the tsx-using file; component.vue with lang="ts" would
    // legitimately fail `vue/block-lang` under `sfcTsx: true` semantics.
    await assertLinted(eslint, ['component-tsx.vue'])
  })

  it('vue: { sfcTsx: glob } — only listed .vue use lang=tsx', async () => {
    const eslint = makeEslint({
      typescript: true,
      vue: { sfcTsx: '**/component-tsx.vue' },
    })
    await assertLinted(eslint, ['component.vue', 'component-tsx.vue'])
  })

  it('vue: { a11y: true, sfcTsx: true }', async () => {
    const eslint = makeEslint({
      typescript: true,
      vue: { a11y: true, sfcTsx: true },
    })
    await assertLinted(eslint, ['component-tsx.vue'])
  })

  it('vue: { a11y: true, sfcTsx: glob }', async () => {
    const eslint = makeEslint({
      typescript: true,
      vue: { a11y: true, sfcTsx: '**/component-tsx.vue' },
    })
    await assertLinted(eslint, ['component.vue', 'component-tsx.vue'])
  })

  it('vue: { files: glob }', async () => {
    const eslint = makeEslint({
      typescript: true,
      vue: { files: ['**/*.vue'] },
    })
    await assertLinted(eslint, ['component.vue'])
  })

  // ── svelte: 2 variants ─────────────────────────────────────────────
  it('svelte: true', async () => {
    const eslint = makeEslint({ typescript: true, svelte: true })
    await assertLinted(eslint, ['component.svelte'])
  })

  it('svelte: { a11y: true }', async () => {
    const eslint = makeEslint({ typescript: true, svelte: { a11y: true } })
    await assertLinted(eslint, ['component.svelte'])
  })

  it('tailwindcss: true', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: true,
      tailwindcss: true,
    })
    await assertLinted(eslint, ['sample.tsx'])
  })

  it('vitest: true', async () => {
    const eslint = makeEslint({ typescript: true, vitest: true })
    await assertLinted(eslint, ['sample.test.ts'])
  })

  // ── node: 3 value shapes (true, string, string[]) ──────────────────
  it('node: true', async () => {
    const eslint = makeEslint({ typescript: true, node: true })
    await assertLinted(eslint, ['sample.js', 'sample.ts'])
  })

  it('node: "**/*.js" — single glob (string)', async () => {
    const eslint = makeEslint({ typescript: true, node: '**/*.js' })
    await assertLinted(eslint, ['sample.js'])
  })

  it('node: [glob, glob] — array', async () => {
    const eslint = makeEslint({
      typescript: true,
      node: ['**/*.js', '**/*.mjs'],
    })
    await assertLinted(eslint, ['sample.js', 'sample.mjs'])
  })

  it('jsdoc: true', async () => {
    const eslint = makeEslint({ typescript: true, jsdoc: true })
    await assertLinted(eslint, ['sample.js', 'sample.ts'])
  })

  it('pnpm: true', async () => {
    const eslint = makeEslint({ typescript: false, pnpm: true })
    await assertLinted(eslint, ['pkg/package.json'])
  })

  it('prettier: true', async () => {
    const eslint = makeEslint({ typescript: false, prettier: true })
    await assertLinted(eslint, [
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

  it('prettier: { printWidth: 80 }', async () => {
    const eslint = makeEslint({
      typescript: false,
      prettier: { printWidth: 80 },
    })
    await assertLinted(eslint, ['sample.js'])
  })
})

describe('smoke: always-on categories', () => {
  it('jsonc/yaml/toml lint under minimal config', async () => {
    const eslint = makeEslint({ typescript: false })
    await assertLinted(eslint, ['sample.json', 'sample.jsonc', 'sample.yaml', 'sample.toml'])
  })

  it('commonjs override category applies to .cjs/.cts', async () => {
    const eslint = makeEslint({ typescript: true })
    await assertLinted(eslint, ['sample.cjs', 'sample.cts'])
  })
})

describe('smoke: framework combinations', () => {
  it('typescript + react + vue (mixed project)', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: true,
      vue: true,
    })
    await assertLinted(eslint, ['sample.tsx', 'sample.jsx', 'component.vue'])
  })

  it('typescript + react + vue + svelte', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: true,
      vue: true,
      svelte: true,
    })
    await assertLinted(eslint, ['sample.tsx', 'sample.jsx', 'component.vue', 'component.svelte'])
  })

  it('typescript: false + framework — framework rules apply without TS', async () => {
    const eslint = makeEslint({ typescript: false, react: true })
    await assertLinted(eslint, ['sample.jsx'])
  })
})

describe('smoke: kitchen sink (every option on)', () => {
  it('everything enabled together', async () => {
    const eslint = makeEslint({
      typescript: true,
      react: { a11y: true },
      vue: { a11y: true, sfcTsx: '**/component-tsx.vue' },
      svelte: { a11y: true },
      tailwindcss: true,
      vitest: true,
      node: true,
      jsdoc: true,
      pnpm: true,
      prettier: true,
    })
    await assertLinted(eslint, [
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
