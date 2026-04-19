import unicorn from 'eslint-plugin-unicorn'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * eslint-plugin-unicorn recommended preset, verbatim. Any per-rule opinions
 * (e.g. disabling `unicorn/no-null`) live in decisions.json.
 */
export function unicornConfig() {
  const files = GLOB_SRC
  return [
    {
      ...unicorn.configs.recommended,
      files,
      name: 'unicute/unicorn/recommended',
    },
    ...overridesBlock('unicorn', files),
  ]
}
