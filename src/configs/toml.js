import { configs as tomlConfigs } from 'eslint-plugin-toml'
import * as tomlParser from 'toml-eslint-parser'

import { GLOB_TOML } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 *
 */
export function tomlConfig() {
  const rec = tomlConfigs?.['flat/standard'] ?? []
  const blocks = (Array.isArray(rec) ? rec : [rec]).map((b) => ({
    ...b,
    files: b.files ?? GLOB_TOML,
    languageOptions: { parser: tomlParser, ...b.languageOptions },
    name: 'unicute/toml/standard',
  }))
  return [...blocks, ...overridesBlock('toml', GLOB_TOML)]
}
