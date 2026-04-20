import tseslint from 'typescript-eslint'

import { GLOB_SVELTE, GLOB_TS, GLOB_TSX, GLOB_VUE } from '../utils.js'

import { overridesBlock, presetAutoOffs } from './_overrides.js'

// TS rules also apply to .vue/.svelte — their SFC parsers delegate
// <script lang="ts"> blocks to typescript-eslint's parser.
const FILES = [...GLOB_TS, ...GLOB_TSX, ...GLOB_VUE, ...GLOB_SVELTE]

/**
 * typescript-eslint strictTypeChecked. Locked to `projectService: true` —
 * each linted file's tsconfig is auto-resolved.
 *
 * @param {object} [opts]
 * @param {string} [opts.tsconfigRootDir] - pin projectService's workspace
 *   root when the default walk-up finds multiple candidate tsconfigs.
 *   Use TypeScript project references to tie the tree into one graph
 *   and pass this here (typically `import.meta.dirname`).
 */
export function typescriptConfig({ tsconfigRootDir } = {}) {
  const scoped = tseslint.configs.strictTypeChecked.map((block) => ({
    ...block,
    files: FILES,
  }))
  const autoOffs = presetAutoOffs(tseslint.configs.strictTypeChecked)
  const parserOptions = { projectService: true }
  if (tsconfigRootDir) parserOptions.tsconfigRootDir = tsconfigRootDir
  return [
    ...scoped,
    {
      files: FILES,
      languageOptions: { parserOptions },
      name: 'unicute/typescript/parser',
    },
    ...(Object.keys(autoOffs).length > 0
      ? [{ files: FILES, name: 'unicute/typescript/preset-superseded-off', rules: autoOffs }]
      : []),
    ...overridesBlock('typescript', FILES),
  ]
}
