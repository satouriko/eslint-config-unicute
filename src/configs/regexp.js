import * as regexp from 'eslint-plugin-regexp'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 *
 */
export function regexpConfig() {
  // eslint-plugin-regexp exposes its flat config under `configs['flat/recommended']`.
  const files = GLOB_SRC
  const recommended = regexp.configs?.['flat/recommended'] ?? []
  const blocks = Array.isArray(recommended) ? recommended : [recommended]
  return [...blocks.map((b) => ({ ...b, files, name: 'unicute/regexp' })), ...overridesBlock('regexp', files)]
}
