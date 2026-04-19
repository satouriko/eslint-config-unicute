import n from 'eslint-plugin-n'

import { GLOB_JS, GLOB_JSX, GLOB_TS, GLOB_TSX } from '../utils.js'

import { overridesBlock } from './_overrides.js'

const DEFAULT_FILES = [...GLOB_JS, ...GLOB_JSX, ...GLOB_TS, ...GLOB_TSX]

/**
 * Node rules (`eslint-plugin-n`). There's no reliable way to tell from the
 * filesystem which code runs on Node, so this is **opt-in** and the caller
 * owns the scope.
 * @param {object} [opts]
 * @param {string | string[]} [opts.files] - default: all JS + TS source
 */
export function nodeConfig({ files = DEFAULT_FILES } = {}) {
  const scope = Array.isArray(files) ? files : [files]
  const rec = n.configs?.['flat/recommended'] ?? []
  const blocks = Array.isArray(rec) ? rec : [rec]
  return [
    ...blocks.map((b) => ({
      ...b,
      files: scope,
      name: 'unicute/n/recommended',
    })),
    ...overridesBlock('node', scope),
  ]
}
