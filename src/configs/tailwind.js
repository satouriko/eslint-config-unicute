import tailwind from 'eslint-plugin-better-tailwindcss'

import { GLOB_SRC } from '../utils.js'

import { overridesBlock } from './_overrides.js'

const FILES = [...GLOB_SRC, '**/*.html']

/**
 * `eslint-plugin-better-tailwindcss` — supports both Tailwind v3 (via the
 * `tailwind.config.js` / `resolveConfig` path) and v4 (reading the
 * `@theme` directives from CSS). Replaces `eslint-plugin-tailwindcss@3`
 * which was v3-only and log-spams on v4.
 *
 * Rule namespace: `better-tailwindcss/*`. See the plugin docs for the
 * list — schema, options, and rule names all differ from the old
 * plugin; migrate any prior decisions in `rule-diff/tailwind.json`.
 */
export function tailwindConfig() {
  const rec = tailwind.configs?.recommended ?? {}
  return [
    { ...rec, files: FILES, name: 'unicute/better-tailwindcss/recommended' },
    ...overridesBlock('tailwind', FILES),
  ]
}
