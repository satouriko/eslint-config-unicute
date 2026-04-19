import js from '@eslint/js'
import confusingBrowserGlobals from 'confusing-browser-globals'
import globals from 'globals'

import { GLOB_CJS, GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * ESLint core rules — apply to every JS-parseable file (JS, TS, Vue).
 * Minimal languageOptions: `ecmaVersion: latest` + `sourceType: module`.
 * Globals and JSX are NOT preset here — consumers opt in via their own
 * config layer (use the re-exported `globals` from the package), or the
 * `react` option (enables JSX parsing + React plugin).
 *
 * `no-restricted-globals` is one of the rare unicute decisions kept in
 * code rather than in `rule-diff/javascript.json`. It's turned on with
 * the 58-entry `confusing-browser-globals` list (same list airbnb uses) —
 * browser globals that commonly shadow safer locals (`event`, `length`,
 * `status`, `name`, …). The decision lives here because the only choice
 * worth making is "yes, use the well-known list"; serializing those 58
 * strings into the category JSON would drown the file. The dashboard
 * renders this rule read-only and tells the user to edit this file to
 * change the decision.
 */
export function javascript() {
  const files = GLOB_SRC
  return [
    {
      ...js.configs.recommended,
      files,
      name: 'unicute/javascript/recommended',
    },
    {
      files,
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      name: 'unicute/javascript/setup',
    },
    {
      files: GLOB_CJS,
      languageOptions: {
        globals: globals.commonjs,
        sourceType: 'commonjs',
      },
      name: 'unicute/javascript/commonjs',
    },
    {
      files,
      name: 'unicute/javascript/no-restricted-globals',
      rules: {
        // Wrap each global into `{ name, message }` so the lint error
        // actually tells the user what to do (access via `window.<name>`
        // if they really need it). Bare strings would just report "X is
        // restricted" with no guidance. Same pattern airbnb uses.
        'no-restricted-globals': [
          'error',
          ...confusingBrowserGlobals
            .filter(
              (variable) =>
                ![
                  // allow list
                  'history',
                  'location',
                  'confirm',
                ].includes(variable),
            )
            .map((name) => ({
              message: `Use \`window.${name}\` instead. See https://github.com/facebook/create-react-app/blob/HEAD/packages/confusing-browser-globals/README.md`,
              name,
            })),
          ...['global', 'self'].map((name) => ({
            message: `Use \`globalThis\` instead.`,
            name,
          })),
        ],
      },
    },
    ...overridesBlock('javascript', files),
  ]
}
