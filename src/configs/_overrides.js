import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tsPlugin from '@typescript-eslint/eslint-plugin'

import { SUPERSEDED_BY, SUPERSEDES } from '../rule-supersedes.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OVERRIDES_DIR = resolve(HERE, '..', '..', 'rule-diff')

/**
 * Each config category has a sibling JSON file in rule-diff/.
 * Shape:
 *   {
 *     "rule-id": {
 *       "decision": "enable" | "disable" | "ignore" | "pending",
 *       "level": "error" | "warn",   // optional, default 'error' for enable
 *       "options": [ ... ],          // optional
 *       "note": "..."                // optional, UI only
 *     }
 *   }
 * @param category
 */
export function loadOverridesJson(category) {
  const path = resolve(OVERRIDES_DIR, `${category}.json`)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

/**
 *
 * @param ruleId
 */
function baseRuleFor(ruleId) {
  if (!ruleId.startsWith('@typescript-eslint/')) return null
  const short = ruleId.slice('@typescript-eslint/'.length)
  const ebr = tsPlugin.rules?.[short]?.meta?.docs?.extendsBaseRule
  if (ebr === true) return short
  if (typeof ebr === 'string') return ebr
  return null
}

/**
 * Compile a category JSON into an ESLint rules map.
 *
 * Enable emits three things:
 *   1. the rule itself, with severity + options
 *   2. `baseRuleFor(id): 'off'` — for typescript-eslint extension rules
 *      (declared via `meta.docs.extendsBaseRule`)
 *   3. each entry in `SUPERSEDES[id]: 'off'` — hand-curated semantic
 *      supersedes (`src/rule-supersedes.js`); covers cases like
 *      `@typescript-eslint/naming-convention` → `camelcase` where upstream
 *      hasn't declared the relationship but enabling one makes the other
 *      redundant/conflicting.
 *
 * Two-phase compile so ordering inside the JSON doesn't matter:
 *   Phase 1: apply every user decision (enable / disable).
 *   Phase 2: derive the auto-offs from every `enable`. The check "victim
 *            not already in `rules`" means "user didn't explicitly decide
 *            on the victim in *this* category's JSON" — so a same-category
 *            explicit enable always wins.
 *
 * Recommended-preset rules (e.g. `no-invalid-regexp` from
 * `eslint:recommended`) live in earlier blocks in unicute's compose order;
 * this category's override block is later, so the `off` we emit here wins
 * on the category's scope. Cross-category enables stay unaffected outside
 * that scope.
 *
 * Cross-plugin `off` is safe in ESLint flat config — `'off'` skips plugin
 * resolution, so referencing a rule whose plugin isn't registered in the
 * current block's scope is a no-op rather than an error.
 * @param category
 */
export function compileOverrides(category) {
  const data = loadOverridesJson(category)
  const rules = {}

  // Phase 1: explicit user decisions from this category's JSON.
  for (const [ruleId, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.decision === 'enable') {
      const level = entry.level ?? 'error'
      rules[ruleId] = entry.options && entry.options.length > 0 ? [level, ...entry.options] : level
    } else if (entry.decision === 'disable') {
      rules[ruleId] = 'off'
    }
  }

  // Phase 2: auto-offs derived from each `enable`. Only write if the
  // victim wasn't touched in phase 1 — respects the user's explicit
  // intent from the same category file.
  for (const [ruleId, entry] of Object.entries(data)) {
    if (entry?.decision !== 'enable') continue
    const base = baseRuleFor(ruleId)
    if (base && !(base in rules)) rules[base] = 'off'
    for (const victim of SUPERSEDES[ruleId] ?? []) {
      if (!(victim in rules)) rules[victim] = 'off'
    }
  }

  return rules
}

/**
 * Auto-off block derived from a plugin's own preset: for every rule the
 * preset turns on, look it up in SUPERSEDED_BY and off every victim that
 * matches `victimFilter`. Used to close the gap in phase-2 — phase-2 only
 * fires on user `enable` decisions, but a preset-enabled superseder also
 * shadows its victim and needs to silence it.
 *
 * Example: `@eslint-community/eslint-comments`'s `recommended` enables
 * `no-unlimited-disable` at error. That supersedes
 * `unicorn/no-abusive-eslint-disable`. Without this helper, both fire on
 * the same `/* eslint-disable *\/` line.
 *
 * @param {Array<{rules?: Record<string, unknown>}> | {rules?: Record<string, unknown>}} presetBlocks
 *   The plugin's own preset block(s) — whatever has its `rules` map of
 *   what it turns on by default.
 * @param {(victimId: string) => boolean} [victimFilter] - narrow the set
 *   of victims, e.g. `(id) => id.startsWith('unicorn/')`. Default: all.
 * @returns {Record<string, 'off'>} a rules map ready to drop into a block.
 */
export function presetAutoOffs(presetBlocks, victimFilter = () => true) {
  const active = new Set()
  const blocks = Array.isArray(presetBlocks) ? presetBlocks : [presetBlocks]
  for (const b of blocks) {
    for (const [id, value] of Object.entries(b?.rules ?? {})) {
      const lvl = Array.isArray(value) ? value[0] : value
      if (lvl !== 'off' && lvl !== 0) active.add(id)
    }
  }
  const offs = {}
  for (const [victim, superseders] of Object.entries(SUPERSEDED_BY)) {
    if (!victimFilter(victim)) continue
    if (superseders.some((s) => active.has(s))) offs[victim] = 'off'
  }
  return offs
}

/**
 * Build a named override block for a category. Returns an empty array if
 * there are no overrides, so callers can spread it unconditionally.
 * @param category
 * @param files
 */
export function overridesBlock(category, files) {
  const rules = compileOverrides(category)
  if (Object.keys(rules).length === 0) return []
  return [
    {
      files,
      name: `unicute/${category}/overrides`,
      rules,
    },
  ]
}
