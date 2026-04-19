import { configs as pnpmConfigs } from 'eslint-plugin-pnpm'

import { overridesBlock } from './_overrides.js'

const FILES = ['**/package.json', '**/pnpm-workspace.yaml']

/**
 *
 */
export function pnpmConfig() {
  const jsoncCfg = pnpmConfigs?.json ?? []
  const yamlCfg = pnpmConfigs?.yaml ?? []
  const blocks = [
    ...(Array.isArray(jsoncCfg) ? jsoncCfg : [jsoncCfg]),
    ...(Array.isArray(yamlCfg) ? yamlCfg : [yamlCfg]),
  ].filter(Boolean)
  return [
    ...blocks.map((b) => ({
      ...b,
      name: b.name ?? 'unicute/pnpm/recommended',
    })),
    ...overridesBlock('pnpm', FILES),
  ]
}
