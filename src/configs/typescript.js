import tseslint from 'typescript-eslint'

import { GLOB_SVELTE, GLOB_TS, GLOB_TSX, GLOB_VUE } from '../utils.js'

import { overridesBlock, presetAutoOffs } from './_overrides.js'

// TS rules also apply to .vue/.svelte — their SFC parsers delegate
// <script lang="ts"> blocks to typescript-eslint's parser.
const FILES = [...GLOB_TS, ...GLOB_TSX, ...GLOB_VUE, ...GLOB_SVELTE]

/**
 * typescript-eslint strictTypeChecked. Locked to `projectService: true` —
 * each linted file's tsconfig is auto-resolved. If you have a weird layout
 * (tsconfig not co-located, custom paths), add a userConfigs block with your
 * own parserOptions; don't fight the defaults here.
 */
export function typescriptConfig() {
  const scoped = tseslint.configs.strictTypeChecked.map((block) => ({
    ...block,
    files: FILES,
  }))
  const autoOffs = presetAutoOffs(tseslint.configs.strictTypeChecked)
  return [
    ...scoped,
    {
      files: FILES,
      languageOptions: { parserOptions: { projectService: true } },
      name: 'unicute/typescript/parser',
    },
    ...(Object.keys(autoOffs).length > 0
      ? [{ files: FILES, name: 'unicute/typescript/preset-superseded-off', rules: autoOffs }]
      : []),
    ...overridesBlock('typescript', FILES),
  ]
}
