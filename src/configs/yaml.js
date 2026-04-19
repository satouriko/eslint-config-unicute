import { configs as ymlConfigs } from 'eslint-plugin-yml'

import { GLOB_YAML } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 *
 */
export function yamlConfig() {
  const rec = ymlConfigs?.['flat/standard'] ?? []
  const blocks = Array.isArray(rec) ? rec : [rec]
  return [
    ...blocks.map((b) => ({
      ...b,
      files: b.files ?? GLOB_YAML,
      name: 'unicute/yaml/standard',
    })),
    ...overridesBlock('yaml', GLOB_YAML),
  ]
}
