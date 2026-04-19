import reactPlugin from '@eslint-react/eslint-plugin'
import jsxA11y from 'eslint-plugin-jsx-a11y'

import { GLOB_JSX_ALL } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * React rules. Default scope: `.jsx` + `.tsx`. Pass `files` to restrict when
 * coexisting with another JSX framework.
 * @param {object} [opts]
 * @param {string | string[]} [opts.files]
 * @param {boolean} [opts.a11y] - also apply eslint-plugin-jsx-a11y
 */
export function reactConfig({ a11y = false, files = GLOB_JSX_ALL } = {}) {
  const scope = Array.isArray(files) ? files : [files]
  const blocks = []

  const rec = reactPlugin.configs?.recommended
  blocks.push({
    files: scope,
    name: 'unicute/react/recommended',
    plugins: rec?.plugins ?? { '@eslint-react': reactPlugin },
    rules: rec?.rules ?? {},
  })
  blocks.push(...overridesBlock('react', scope))

  if (a11y) {
    const a11yRec = jsxA11y.flatConfigs?.recommended ?? jsxA11y.configs?.recommended
    if (a11yRec) {
      blocks.push({ ...a11yRec, files: scope, name: 'unicute/jsx-a11y' })
    }
    blocks.push(...overridesBlock('jsx-a11y', scope))
  }
  return blocks
}
