import { GLOB_JSX_ALL } from '../utils.js'

/**
 * JSX parser options — always applied to .jsx and .tsx files regardless of
 * framework. React/Vue/Solid plugins layered on top bring the actual rules.
 */
export function jsxConfig() {
  return [
    {
      files: GLOB_JSX_ALL,
      languageOptions: {
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      name: 'unicute/jsx/parser',
    },
  ]
}
