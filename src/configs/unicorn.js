import eslintJs from '@eslint/js'
import unicorn from 'eslint-plugin-unicorn'

import { GLOB_SRC } from '../utils.js'

import { loadOverridesJson, overridesBlock } from './_overrides.js'

const isOff = (v) => v === 'off' || v === 0 || (Array.isArray(v) && (v[0] === 'off' || v[0] === 0))
const isCoreRule = (id) => !id.includes('/')

/**
 * Spread `unicorn.configs.recommended` verbatim. Then revive the core
 * ESLint rules unicorn's recommended off's as editorial opinion
 * (`no-nested-ternary`, `no-negated-condition`) — those off's compose
 * AFTER `javascript()` and would silently defeat any `enable` the user
 * wrote in `rule-diff/javascript.json`, plus any `error` the @eslint/js
 * recommended preset put on that rule.
 *
 * The revive is deliberately conservative: a rule only comes back if it
 * had a non-off "intended" state before unicorn ran. Priority:
 *   1. Explicit `disable` in rule-diff/javascript.json  → stay off.
 *   2. Explicit `enable` in rule-diff/javascript.json   → use that.
 *   3. @eslint/js recommended has it at error/warn      → use that.
 *   4. Otherwise                                        → stay off.
 *
 * Users who want unicorn's opinion to win (i.e. truly off the core
 * version) have two paths: `disable` in rule-diff/javascript.json
 * (case 1), or enable `unicorn/<same-name>` which trips our SUPERSEDES
 * phase-2 and off's the core rule on purpose.
 */
export function unicornConfig() {
  const files = GLOB_SRC
  const rec = unicorn.configs.recommended
  const eslintRec = eslintJs.configs.recommended.rules ?? {}
  const jsDecisions = loadOverridesJson('javascript')

  const revive = {}
  for (const [id, v] of Object.entries(rec.rules ?? {})) {
    if (!isCoreRule(id) || !isOff(v)) continue
    const d = jsDecisions[id]
    if (d?.decision === 'disable') continue
    if (d?.decision === 'enable') {
      const level = d.level ?? 'error'
      revive[id] = d.options && d.options.length > 0 ? [level, ...d.options] : level
      continue
    }
    const recVal = eslintRec[id]
    if (recVal !== undefined && !isOff(recVal)) {
      revive[id] = recVal
    }
  }

  return [
    { ...rec, files, name: 'unicute/unicorn/recommended' },
    ...(Object.keys(revive).length > 0 ? [{ files, name: 'unicute/unicorn/revive-core', rules: revive }] : []),
    ...overridesBlock('unicorn', files),
  ]
}
