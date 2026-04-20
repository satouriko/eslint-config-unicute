// eslint.config.js for the fixture project.
//
// Purpose: give the VSCode ESLint extension a config to pick up when the
// user opens files under `tests/fixture-project/fixtures/`. Without this,
// the extension walks up to the repo root, which explicitly ignores this
// subtree (`ignores: ['tests/fixture-project/**']`) so `pnpm lint` stays
// fast — and the editor ends up showing nothing.
//
// Every framework option is set explicitly (not auto-detected) so all
// fixture file types parse and lint:
//   - .vue / .svelte / .jsx / .tsx / .vue-tsx
//   - .test.ts (vitest globals)
//   - tailwind className literals
//
// `pnpm lint` at the repo root is unaffected — it still runs against the
// repo-root config and skips this directory via the ignore pattern.
// `pnpm test` is unaffected — the smoke tests pass an `overrideConfig`
// directly to ESLint's constructor and never look at this file.
//
// typescript-eslint's projectService walks the tsconfig reference graph
// (repo-root tsconfig → this directory's tsconfig → per-framework
// sub-tsconfigs for React / Vue / default), but its `tsconfigRootDir`
// auto-inference still flips between the two root-level tsconfigs
// (repo and this project) depending on VSCode's cwd — pin explicitly.

import unicute from 'eslint-config-unicute'

export default unicute({
  // Pin projectService + the import resolver at this directory's
  // umbrella tsconfig. The 3 sub-projects (react/vue/default) live
  // under `references`, both tools reach them from here.
  typescript: { tsconfigRootDir: import.meta.dirname },
  react: true,
  // sfcTsx is scoped to just the TSX-using SFC — the other .vue files
  // keep the default `lang="ts"` block-lang requirement.
  vue: { a11y: true, sfcTsx: 'fixtures/component-tsx.vue' },
  svelte: true,
  tailwindcss: true,
  vitest: true,
})
