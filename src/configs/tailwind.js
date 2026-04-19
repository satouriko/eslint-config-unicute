import tailwind from 'eslint-plugin-tailwindcss'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

const FILES = [...GLOB_SRC, '**/*.html']

/**
 *
 */
export function tailwindConfig() {
  const rec = tailwind.configs?.['flat/recommended'] ?? []
  const blocks = Array.isArray(rec) ? rec : [rec]
  return [
    ...blocks.map((b) => ({
      ...b,
      files: FILES,
      name: 'unicute/tailwind/recommended',
    })),
    ...overridesBlock('tailwind', FILES),
  ]
}
