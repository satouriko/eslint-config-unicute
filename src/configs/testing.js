import vitest from '@vitest/eslint-plugin'
import noOnlyTests from 'eslint-plugin-no-only-tests'

import { GLOB_TESTS } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * @param {object} [opts]
 * @param {boolean} [opts.vitest]
 */
export function testingConfig({ vitest: useVitest = false } = {}) {
  return [
    {
      files: GLOB_TESTS,
      name: 'unicute/testing/plugins',
      plugins: {
        'no-only-tests': noOnlyTests,
        ...(useVitest ? { vitest } : {}),
      },
      rules: useVitest ? (vitest.configs?.recommended?.rules ?? {}) : {},
    },
    ...overridesBlock('testing', GLOB_TESTS),
  ]
}
