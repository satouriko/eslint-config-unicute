import { createRequire } from 'node:module'

import format from 'eslint-plugin-format'
import { configs as jsoncConfigs } from 'eslint-plugin-jsonc'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import toml from 'eslint-plugin-toml'
import { configs as ymlConfigs } from 'eslint-plugin-yml'

import { GLOB_JSON, GLOB_JSONC, GLOB_TOML, GLOB_YAML } from '../utils.js'

const require = createRequire(import.meta.url)

// Prettier plugin resolution. Two constraints fight here:
//   1. ESLint's config system structuredClones rule options, which throws
//      DataCloneError on live plugin module objects (they contain
//      functions). Plugins must be passed as strings.
//   2. Plain bare strings like `'prettier-plugin-toml'` work in hoisted
//      layouts but fail silently in pnpm's symlinked one, because
//      prettier resolves strings relative to its own install path and
//      `.pnpm/prettier@3/...` isn't a sibling of most plugins.
// Fix: pre-resolve each plugin to an absolute file path here. Strings
// clone fine and absolute paths resolve regardless of layout.
const PRETTIER_PLUGIN_TOML = require.resolve('prettier-plugin-toml')
const PRETTIER_PLUGIN_XML = require.resolve('@prettier/plugin-xml')

/**
 * unicute's opinionated Prettier defaults. Passed through to Prettier via the
 * `prettier/prettier` rule (the only rule used; see below). We ignore
 * `.prettierrc` so the whole project shares one source of truth.
 */
export const DEFAULT_PRETTIER_OPTIONS = {
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  experimentalOperatorPosition: 'start',
  printWidth: 120,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
}

/**
 * File globs that each Prettier parser handles for file types ESLint has no
 * native parser for. We use `format.parserPlain` to satisfy ESLint's "every
 * file needs a parser" requirement and then run the regular
 * `prettier/prettier` rule with an explicit `parser` option per entry —
 * no separate `format/prettier` rule needed.
 */
const FORMAT_TARGETS = [
  { files: ['**/*.css'], parser: 'css' },
  { files: ['**/*.scss'], parser: 'scss' },
  { files: ['**/*.less'], parser: 'less' },
  { files: ['**/*.html'], parser: 'html' },
  { files: ['**/*.{graphql,gql}'], parser: 'graphql' },
  { files: ['**/*.{md,markdown}'], parser: 'markdown' },
  { files: ['**/*.{xml,svg}'], parser: 'xml', plugins: [PRETTIER_PLUGIN_XML] },
]

/**
 * eslint-plugin-toml has no `flat/prettier` compat preset (prettier's core
 * doesn't natively parse TOML). unicute loads `prettier-plugin-toml` into
 * prettier's `plugins` option so prettier does format `.toml` via
 * `prettier/prettier`; here we off eslint-plugin-toml's stylistic rules
 * so the two don't fight over output. Semantic TOML rules — `keys-order`,
 * `tables-order`, `no-unreadable-number-separator`, `precision-of-*`,
 * `vue-custom-block/*` — stay on.
 */
const TOML_FORMAT_RULES_OFF = {
  'toml/array-bracket-newline': 'off',
  'toml/array-bracket-spacing': 'off',
  'toml/array-element-newline': 'off',
  'toml/comma-style': 'off',
  'toml/indent': 'off',
  'toml/inline-table-curly-newline': 'off',
  'toml/inline-table-curly-spacing': 'off',
  'toml/inline-table-key-value-newline': 'off',
  'toml/key-spacing': 'off',
  'toml/no-space-dots': 'off',
  'toml/padding-line-between-pairs': 'off',
  'toml/padding-line-between-tables': 'off',
  'toml/quoted-keys': 'off',
  'toml/spaced-comment': 'off',
  'toml/table-bracket-spacing': 'off',
}

/**
 * Prettier integration — must be last.
 *
 *   - One rule does everything: `prettier/prettier` from
 *     `eslint-plugin-prettier`. File types with native ESLint parsers
 *     (JS/TS/JSX/TSX/Vue/Svelte/JSON/YAML/TOML) rely on prettier auto-
 *     inferring the parser; TOML and CSS/HTML/XML/… need an explicit
 *     `parser` override per scope, passed via block-level rule options.
 *   - For file types without any ESLint parser (CSS / SCSS / LESS /
 *     HTML / GraphQL / XML / SVG), we register `eslint-plugin-format`'s
 *     `parserPlain` to satisfy ESLint's must-have-a-parser rule. We do
 *     NOT use format's own `format/prettier` — a second rule would just
 *     duplicate `prettier/prettier`.
 *   - jsonc / yml / toml each get their stylistic rules turned off (via
 *     the plugins' own `flat/prettier` presets for jsonc and yml, and a
 *     hand-curated off list for toml). Semantic rules — duplicate keys,
 *     invalid JSON numbers, TOML keys-order, etc. — stay active.
 * @param {Record<string, unknown>} [userOptions] - override defaults
 * @param {object} [opts]
 * @param {boolean} [opts.svelte] - auto-load `prettier-plugin-svelte`
 */
export function prettierConfig(userOptions = {}, { svelte = false } = {}) {
  const options = { ...DEFAULT_PRETTIER_OPTIONS, ...userOptions }
  if (svelte) {
    // Same resolution fix as TOML — pre-resolve to an absolute path so
    // prettier finds it under pnpm.
    options.plugins = [...(options.plugins ?? []), require.resolve('prettier-plugin-svelte')]
  }
  // Teach prettier about TOML via the pre-resolved absolute plugin path
  // (see PRETTIER_PLUGIN_TOML above for why we resolve it ourselves).
  options.plugins = [...(options.plugins ?? []), PRETTIER_PLUGIN_TOML]
  const prettierOptions = [options, { usePrettierrc: false }]

  // jsonc / yml ship their own prettier-compat presets that off the
  // stylistic rules that fight with prettier. Apply both. For TOML we use
  // the hand-maintained off list above. Each is scoped to the file types
  // it's meant for — doesn't touch anything else.
  const jsoncPrettier = asArray(jsoncConfigs?.['flat/prettier']).map((b) => ({
    ...b,
    files: [...GLOB_JSON, ...GLOB_JSONC],
    name: 'unicute/jsonc/prettier-off',
  }))
  const ymlPrettier = asArray(ymlConfigs?.['flat/prettier']).map((b) => ({
    ...b,
    files: GLOB_YAML,
    name: 'unicute/yml/prettier-off',
  }))
  const tomlPrettier = [
    {
      files: GLOB_TOML,
      name: 'unicute/toml/prettier-off',
      plugins: { toml },
      rules: TOML_FORMAT_RULES_OFF,
    },
    {
      // eslint-plugin-prettier calls `prettier.getFileInfo()` WITHOUT our
      // plugins to infer the parser from the extension — so for .toml it
      // gets `undefined` and falls back to `babel`, then prettier tries to
      // parse TOML as JS. Override `prettier/prettier` on `.toml` files
      // with an explicit `parser: 'toml'`; combined with the already-loaded
      // `prettier-plugin-toml` in `options.plugins` it produces correct
      // TOML output.
      files: GLOB_TOML,
      name: 'unicute/toml/prettier',
      rules: {
        'prettier/prettier': ['warn', { ...options, parser: 'toml' }, { usePrettierrc: false }],
      },
    },
  ]

  return [
    {
      ...prettierRecommended,
      name: 'unicute/prettier',
      rules: {
        ...prettierRecommended.rules,
        'prettier/prettier': ['warn', ...prettierOptions],
      },
    },
    ...jsoncPrettier,
    ...ymlPrettier,
    ...tomlPrettier,
    // File types ESLint doesn't parse natively (CSS / HTML / XML / …).
    // parserPlain makes ESLint accept the file; overriding
    // `prettier/prettier` with an explicit `parser` per scope tells
    // prettier the right format so its internal `getFileInfo`
    // auto-inference (which doesn't see our plugins) gets skipped.
    ...FORMAT_TARGETS.map(({ files, parser, plugins }) => ({
      files,
      languageOptions: { parser: format.parserPlain },
      name: `unicute/prettier/${parser}`,
      rules: {
        'prettier/prettier': [
          'warn',
          { ...options, parser, plugins: [...(options.plugins ?? []), ...(plugins ?? [])] },
          { usePrettierrc: false },
        ],
      },
    })),
  ]
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}
