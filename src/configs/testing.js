import vitest from '@vitest/eslint-plugin'
import noOnlyTests from 'eslint-plugin-no-only-tests'

import { GLOB_TESTS } from '../utils.js'

import { compileOverrides } from './_overrides.js'

/**
 * @param {object} [opts]
 * @param {boolean} [opts.vitest]
 */
export function testingConfig({ vitest: useVitest = false } = {}) {
  const blocks = [
    {
      files: GLOB_TESTS,
      name: 'unicute/testing/plugins',
      plugins: {
        'no-only-tests': noOnlyTests,
        ...(useVitest ? { vitest } : {}),
      },
      rules: useVitest ? (vitest.configs?.recommended?.rules ?? {}) : {},
    },
  ]

  // Testing overrides JSON mixes `vitest/*` with plugin-agnostic entries
  // (`no-only-tests/*`). When vitest is disabled, emit only the non-vitest
  // rules — referencing `vitest/*` rules with a non-`off` severity while
  // the plugin isn't registered throws at lint time.
  const rules = compileOverrides('testing')
  const filtered = useVitest
    ? rules
    : Object.fromEntries(Object.entries(rules).filter(([id]) => !id.startsWith('vitest/')))
  if (Object.keys(filtered).length > 0) {
    blocks.push({
      files: GLOB_TESTS,
      name: 'unicute/testing/overrides',
      rules: filtered,
    })
  }

  return blocks
}
