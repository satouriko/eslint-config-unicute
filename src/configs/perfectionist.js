import perfectionist from 'eslint-plugin-perfectionist'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * perfectionist plugin registration only. Sorting preferences (natural vs
 * alphabetical, which entries to sort, etc.) live in decisions.json under
 * the "perfectionist" category.
 *
 * Note: the plugin is also registered in imports.js so import-related
 * sort rules can be decided there; this block exists for non-import sorts.
 */
export function perfectionistConfig() {
  const files = GLOB_SRC
  return [
    {
      files,
      name: 'unicute/perfectionist',
      plugins: { perfectionist },
    },
    ...overridesBlock('perfectionist', files),
  ]
}
