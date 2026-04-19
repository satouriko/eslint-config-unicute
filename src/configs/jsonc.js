import { configs as jsoncConfigs } from 'eslint-plugin-jsonc'
import * as jsoncParser from 'jsonc-eslint-parser'

import { GLOB_JSON, GLOB_JSONC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 *
 */
export function jsoncConfig() {
  const files = [...GLOB_JSON, ...GLOB_JSONC]
  const rec = jsoncConfigs?.['flat/recommended-with-jsonc'] ?? []
  const blocks = (Array.isArray(rec) ? rec : [rec]).map((b) => ({
    ...b,
    files,
    languageOptions: { parser: jsoncParser, ...b.languageOptions },
    name: 'unicute/jsonc/recommended',
  }))
  return [...blocks, ...overridesBlock('jsonc', files)]
}
