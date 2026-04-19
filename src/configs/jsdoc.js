import jsdoc from 'eslint-plugin-jsdoc'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 *
 */
export function jsdocConfig() {
  const rec = jsdoc.configs?.['flat/recommended'] ?? []
  const blocks = Array.isArray(rec) ? rec : [rec]
  return [
    ...blocks.map((b) => ({
      ...b,
      files: GLOB_SRC,
      name: 'unicute/jsdoc/recommended',
    })),
    ...overridesBlock('jsdoc', GLOB_SRC),
  ]
}
