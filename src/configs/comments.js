import comments from '@eslint-community/eslint-plugin-eslint-comments'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock, presetAutoOffs } from './_overrides.js'

/**
 *
 */
export function commentsConfig() {
  const files = GLOB_SRC
  const rec = comments.configs?.recommended
  const autoOffs = presetAutoOffs(rec ?? {})
  return [
    {
      files,
      name: 'unicute/eslint-comments/recommended',
      plugins: { '@eslint-community/eslint-comments': comments },
      rules: rec?.rules ?? {},
    },
    ...(Object.keys(autoOffs).length > 0
      ? [{ files, name: 'unicute/eslint-comments/preset-superseded-off', rules: autoOffs }]
      : []),
    ...overridesBlock('comments', files),
  ]
}
