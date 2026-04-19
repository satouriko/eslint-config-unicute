import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { flatConfigs as importXFlatConfigs } from 'eslint-plugin-import-x'
import perfectionist from 'eslint-plugin-perfectionist'
import unusedImports from 'eslint-plugin-unused-imports'

import { GLOB_SRC, GLOB_SVELTE, GLOB_TS, GLOB_TSX, GLOB_VUE } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * Imports management — plugins only, no opinions. Opinions belong in
 * rule-diff/imports.json (not here).
 *
 *   - import-x  : correctness (duplicates, cycles, unresolved, etc.)
 *   - perfectionist (subset) : import / named-import / named-export / export sorting
 *   - unused-imports : auto-remove unused imports
 *
 * When `typescript` is on, we register `eslint-import-resolver-typescript`
 * scoped to TS-ish files only (`.ts/.tsx/.vue/.svelte`). Pure `.js` files
 * skip the TS resolver — so config files like `eslint.config.js` don't get
 * their imports resolved through tsconfig paths and fall back to plain
 * Node resolution.
 *
 * `project` uses globs so every tsconfig in the project participates —
 * matters for monorepos (each package has its own tsconfig, and imports
 * that cross package boundaries resolve through the union of paths) and
 * for toolchain-split setups (`tsconfig.app.json` / `tsconfig.node.json`
 * / `tsconfig.test.json` from Vite, Nuxt, Astro, etc.). Single-root
 * projects with just one `tsconfig.json` see no difference from the
 * auto-discover mode.
 *
 * `alwaysTryTypes: true` lets import-x find `@types/*` packages even for
 * runtime imports — handy when a library ships types via DefinitelyTyped.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.typescript=false]
 */
export function imports({ typescript = false } = {}) {
  const files = GLOB_SRC
  const importXRec = importXFlatConfigs?.recommended ?? []
  const recBlocks = Array.isArray(importXRec) ? importXRec : [importXRec]
  const blocks = [
    ...recBlocks.map((b) => ({
      ...b,
      files,
      name: b.name ?? 'unicute/imports/import-x-recommended',
    })),
    {
      files,
      name: 'unicute/imports/plugins',
      plugins: {
        perfectionist,
        'unused-imports': unusedImports,
      },
    },
  ]
  if (typescript) {
    blocks.push({
      files: [...GLOB_TS, ...GLOB_TSX, ...GLOB_VUE, ...GLOB_SVELTE],
      name: 'unicute/imports/ts-resolver',
      settings: {
        'import-x/resolver-next': [
          createTypeScriptImportResolver({
            alwaysTryTypes: true,
            project: ['**/tsconfig.json', '**/tsconfig.*.json'],
          }),
        ],
      },
    })
  }
  blocks.push(...overridesBlock('imports', files))
  return blocks
}
