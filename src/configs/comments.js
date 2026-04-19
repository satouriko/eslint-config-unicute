import comments from '@eslint-community/eslint-plugin-eslint-comments'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 *
 */
export function commentsConfig() {
  const files = GLOB_SRC
  const rec = comments.configs?.recommended
  return [
    {
      files,
      name: 'unicute/eslint-comments/recommended',
      plugins: { '@eslint-community/eslint-comments': comments },
      rules: rec?.rules ?? {},
    },
    ...overridesBlock('comments', files),
  ]
}
