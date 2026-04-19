import type { Linter } from 'eslint'

export interface ReactOptions {
  /** Paths where React rules apply. Default: `**\/*.{jsx,tsx}`. */
  files?: string | string[]
  /** Also apply `eslint-plugin-jsx-a11y` on the same scope. Default: `false`. */
  a11y?: boolean
}

export interface SvelteOptions {
  /**
   * Apply `eslint-plugin-svelte`'s a11y rules (`svelte/a11y-*`). Default: `false`
   * (symmetric with react/vue). Even though they're part of the Svelte
   * recommended preset, unicute turns them off unless you opt in.
   */
  a11y?: boolean
}

export interface VueOptions {
  /**
   * Paths where Vue rules apply. Default: `**\/*.vue` only. To run Vue rules
   * on standalone `.tsx` Vue components, include those paths explicitly:
   *   `{ files: ['**\/*.vue', 'src/vue/**\/*.tsx'], tsx: 'src/vue/**\/*.tsx' }`.
   */
  files?: string | string[]
  /**
   * Enable JSX parsing inside SFC `<script>` blocks (i.e. `<script lang="tsx">`
   * / `<script lang="jsx">`). `true` for all covered SFCs, a glob to restrict.
   * Controls parser features only — doesn't change rule scope.
   */
  sfcTsx?: boolean | string | string[]
  /** Also apply `eslint-plugin-vuejs-accessibility`. Default: `false`. */
  a11y?: boolean
}

/**
 * Prettier options passed directly to Prettier via `eslint-plugin-prettier`.
 * unicute **ignores `.prettierrc`** by design — this is the one source of truth.
 * Accepts anything Prettier accepts (`semi`, `singleQuote`, `printWidth`,
 * `plugins`, overrides, etc.).
 */
export type PrettierOptions = Record<string, unknown>

export interface UnicuteOptions {
  /** Auto-ignore paths from `.gitignore`. Default: `true`. */
  gitignore?: boolean

  /**
   * TypeScript rules. Default: auto-detect `typescript`. `projectService: true`
   * is locked in — add a custom `languageOptions.parserOptions` via
   * `userConfigs` if your layout needs something different.
   */
  typescript?: boolean

  /**
   * React rules + optional jsx-a11y. Default: auto-detect `react`.
   * When coexisting with other JSX frameworks, pass `{ files }` to restrict.
   */
  react?: boolean | ReactOptions

  /** Vue SFC rules + optional vuejs-accessibility. Default: auto-detect `vue`. */
  vue?: boolean | VueOptions

  /**
   * Svelte rules. Default: auto-detect `svelte`. A11y (`svelte/a11y-*`) is
   * off by default — pass `{ a11y: true }` to opt in, matching react/vue.
   */
  svelte?: boolean | SvelteOptions

  /** Tailwind class lint. Default: auto-detect `tailwindcss`. */
  tailwindcss?: boolean

  /** Vitest rules on test files. Default: auto-detect `vitest`. */
  vitest?: boolean

  /**
   * Node.js rules (`eslint-plugin-n`). **Opt-in only** — there's no reliable
   * way to tell Node code from browser code on the filesystem. Pass `true`
   * (all JS/TS source), or a glob / glob[] for specific paths.
   * Default: `false`.
   */
  node?: boolean | string | string[]

  /** pnpm workspace hygiene. Default: auto-detect `pnpm-workspace.yaml`. */
  pnpm?: boolean

  /**
   * JSDoc rules (`eslint-plugin-jsdoc`). **Opt-in** — many rules in the
   * recommended set fire on any `/** ... *\/` block, which isn't always an
   * actual JSDoc comment. Enable only when the project commits to JSDoc
   * as a documentation layer. Default: `false`.
   */
  jsdoc?: boolean

  /**
   * Prettier configuration. unicute takes ownership of Prettier — `.prettierrc`
   * is **not read**. Pass an options object to override unicute's defaults:
   * `{ semi: false, singleQuote: true, trailingComma: 'all', printWidth: 80,
   * tabWidth: 2, arrowParens: 'always', endOfLine: 'lf' }`.
   *
   * `true` uses defaults, `false` disables Prettier entirely.
   */
  prettier?: boolean | PrettierOptions
}

/**
 * First argument of `unicute()`. Mixes unicute options with a flat ESLint
 * config block — unknown keys (`files`, `rules`, `plugins`, …) become a user
 * config layer applied before any extra arguments.
 */
export type UnicuteFirstArg = UnicuteOptions & Linter.Config

/**
 * Build the full flat ESLint config.
 *
 * ```js
 * import unicute, { globals } from 'eslint-config-unicute'
 *
 * export default unicute(
 *   {
 *     react: { a11y: true },
 *     vue: { tsx: ['src/vue/**\/*.tsx'], a11y: true },
 *     node: ['server/**'],
 *     prettier: { semi: true, printWidth: 100 },
 *     files: ['src/**'],
 *     rules: { 'no-console': 'off' },
 *   },
 *   { files: ['**\/*.js'], languageOptions: { globals: { ...globals.browser } } },
 * )
 * ```
 */
export declare function unicute(firstArg?: UnicuteFirstArg, ...userConfigs: Linter.Config[]): Linter.Config[]
export default unicute

/** Re-export of the `globals` package for `languageOptions.globals`. */
export { default as globals } from 'globals'
