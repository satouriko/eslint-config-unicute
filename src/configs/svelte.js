import svelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'
import tseslint from 'typescript-eslint'

import { GLOB_SVELTE } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * Svelte component rules. `<script lang="ts">` blocks parse as TypeScript.
 *
 * A11y rules live inside `eslint-plugin-svelte` (prefixed `svelte/a11y-*`)
 * and are in its recommended preset, but unicute defaults `a11y` to `false`
 * for symmetry with react/vue — we turn every `svelte/a11y-*` rule off unless
 * you opt in with `a11y: true`.
 * @param {object} [opts]
 * @param {boolean} [opts.a11y=false]
 */
export function svelteConfig({ a11y = false } = {}) {
  const recommended = svelte.configs?.recommended ?? []
  const recBlocks = Array.isArray(recommended) ? recommended : [recommended]
  const blocks = []

  for (const b of recBlocks) {
    blocks.push({
      ...b,
      files: GLOB_SVELTE,
      name: b.name ?? 'unicute/svelte/recommended',
    })
  }

  blocks.push({
    files: GLOB_SVELTE,
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        ecmaVersion: 'latest',
        extraFileExtensions: ['.svelte'],
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
    name: 'unicute/svelte/setup',
  })

  // Turn every recommended `svelte/a11y-*` rule off when a11y is disabled.
  if (!a11y) {
    const a11yOff = {}
    for (const b of recBlocks) {
      for (const ruleId of Object.keys(b?.rules ?? {})) {
        if (ruleId.startsWith('svelte/a11y-')) a11yOff[ruleId] = 'off'
      }
    }
    if (Object.keys(a11yOff).length > 0) {
      blocks.push({
        files: GLOB_SVELTE,
        name: 'unicute/svelte/a11y-off',
        rules: a11yOff,
      })
    }
  }

  blocks.push(...overridesBlock('svelte', GLOB_SVELTE))
  return blocks
}
