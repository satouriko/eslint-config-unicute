import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { isPackageExists as _isPackageExists } from 'local-pkg'

/**
 * Does the given package resolve from cwd?
 * @param name
 * @param cwd
 */
export function isPackageExists(name, cwd = process.cwd()) {
  try {
    return _isPackageExists(name, { paths: [cwd] })
  } catch {
    return false
  }
}

/**
 * Does cwd contain a pnpm workspace file?
 * @param cwd
 */
export function hasPnpmWorkspace(cwd = process.cwd()) {
  return existsSync(join(cwd, 'pnpm-workspace.yaml'))
}

export const GLOB_JS = ['**/*.{js,mjs,cjs}']
export const GLOB_JSX = ['**/*.jsx']
export const GLOB_TS = ['**/*.{ts,mts,cts}']
export const GLOB_TSX = ['**/*.tsx']
/** CommonJS source files — .cjs and .cts. */
export const GLOB_CJS = ['**/*.{cjs,cts}']
/** Any file using JSX syntax (.jsx + .tsx). */
export const GLOB_JSX_ALL = ['**/*.{jsx,tsx}']
export const GLOB_VUE = ['**/*.vue']
export const GLOB_SVELTE = ['**/*.svelte']
export const GLOB_SRC = ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,vue,svelte}']
export const GLOB_TESTS = [
  '**/*.{test,spec}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}',
  '**/__tests__/**',
  '**/test/**',
  '**/tests/**',
]
export const GLOB_JSON = ['**/*.json']
export const GLOB_JSONC = ['**/*.{jsonc,json5}']
export const GLOB_YAML = ['**/*.{yaml,yml}']
export const GLOB_TOML = ['**/*.toml']
export const GLOB_MARKDOWN = ['**/*.md']
