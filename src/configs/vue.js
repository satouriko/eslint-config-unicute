import tsPlugin from '@typescript-eslint/eslint-plugin'
import vue from 'eslint-plugin-vue'
import vueA11y from 'eslint-plugin-vuejs-accessibility'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

import { SUPERSEDES } from '../rule-supersedes.js'
import { GLOB_VUE } from '../utils.js'

import { loadOverridesJson, overridesBlock } from './_overrides.js'

/**
 * When `disableTypeChecked` turns off a type-aware `@typescript-eslint/*`
 * rule on sfcTsxScope, its counterpart core rule (extension via
 * `extendsBaseRule`, or superseded via SUPERSEDES) was previously off'd
 * to avoid double-firing — nothing re-enables it automatically. Without
 * a revive step the sfcTsx scope ends up with NEITHER the type-aware
 * nor the core version active.
 *
 * The revive matches the user's intent for each core rule:
 *   - If the user explicitly `enable`d the core in rule-diff/*.json,
 *     use their level + options.
 *   - If the user explicitly `disable`d it, respect that — don't revive.
 *   - Otherwise fall back to `'error'` (the TS version from
 *     strictTypeChecked was at error, so this preserves coverage).
 */
function computeRevivedCoreRules(disableRulesMap) {
  // Merge every rule-diff category JSON that could hold a decision for
  // a revive target. Core rules live in `javascript`, the others in
  // their respective category files.
  const decisions = {
    ...loadOverridesJson('javascript'),
    ...loadOverridesJson('imports'),
    ...loadOverridesJson('perfectionist'),
    ...loadOverridesJson('unicorn'),
    ...loadOverridesJson('regexp'),
  }

  const revive = {}
  const isOff = (v) => v === 'off' || v === 0 || (Array.isArray(v) && (v[0] === 'off' || v[0] === 0))

  const emitRevive = (ruleId) => {
    if (ruleId in revive) return
    const d = decisions[ruleId]
    if (d?.decision === 'disable') return // explicitly off — don't revive
    if (d?.decision === 'enable') {
      const level = d.level ?? 'error'
      revive[ruleId] = d.options && d.options.length > 0 ? [level, ...d.options] : level
      return
    }
    // No explicit decision: match the TS version's severity.
    revive[ruleId] = 'error'
  }

  // 1. extension rules — the TS rule extends a core rule (declared via
  //    `meta.docs.extendsBaseRule`). _overrides.js's `baseRuleFor` off'd
  //    the core when the TS version was enabled. Reverse that.
  for (const [id, value] of Object.entries(disableRulesMap)) {
    if (!isOff(value)) continue
    if (!id.startsWith('@typescript-eslint/')) continue
    const short = id.slice('@typescript-eslint/'.length)
    const ebr = tsPlugin.rules?.[short]?.meta?.docs?.extendsBaseRule
    const base = ebr === true ? short : typeof ebr === 'string' ? ebr : null
    if (base) emitRevive(base)
  }

  // 2. SUPERSEDES victims — if a disabled rule is a superseder in our
  //    table, revive its victims (e.g. `@typescript-eslint/prefer-includes`
  //    off → revive `unicorn/prefer-includes`).
  for (const [superseder, victims] of Object.entries(SUPERSEDES)) {
    if (!isOff(disableRulesMap[superseder])) continue
    for (const victim of victims) emitRevive(victim)
  }
  return revive
}

/**
 * Vue SFC rules. `<script>` blocks parse as TypeScript.
 * @param {object} [opts]
 * @param {string | string[]} [opts.files]
 * @param {boolean | string | string[]} [opts.sfcTsx] - enable JSX inside SFC <script>
 *   blocks. `true` for all covered SFCs, a glob to restrict to specific ones.
 * @param {boolean} [opts.a11y] - also apply eslint-plugin-vuejs-accessibility
 */
export function vueConfig({ a11y = false, files, sfcTsx = false } = {}) {
  const sfcTsxScope = sfcTsx ? (sfcTsx === true ? GLOB_VUE : Array.isArray(sfcTsx) ? sfcTsx : [sfcTsx]) : []
  // Default scope is just `.vue`. `sfcTsx` only controls JSX parser enablement;
  // to run Vue rules on standalone .tsx files, include them explicitly via `files`.
  const scope = files ? (Array.isArray(files) ? files : [files]) : GLOB_VUE

  const blocks = []
  const recommended = vue.configs?.['flat/recommended'] ?? []
  const recBlocks = Array.isArray(recommended) ? recommended : [recommended]
  for (const b of recBlocks) {
    blocks.push({
      ...b,
      files: scope,
      name: b.name ?? 'unicute/vue/recommended',
    })
  }
  blocks.push({
    files: GLOB_VUE,
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
    name: 'unicute/vue/setup',
  })
  if (sfcTsxScope.length > 0) {
    // typescript-eslint/parser has a documented quirk: when
    // `parserOptions.project` OR `projectService` is set AND the file is
    // an "unknown extension" (.vue, .md, …), the parser **always** parses
    // with `jsx: false`, ignoring `ecmaFeatures.jsx: true`. TSX content
    // inside a Vue SFC becomes un-parseable ("Unterminated regular
    // expression literal" on `return <div/>`).
    // Refs:
    //   - https://github.com/vuejs/create-vue/issues/123
    //   - https://typescript-eslint.io/packages/parser/#jsx (and the
    //     `createProgramFromConfigFile`-path note about `.vue` files)
    //   - Workaround source: `@vue/eslint-config-typescript`'s
    //     `createNonTypeCheckingRulesForVue` — same `project: false` +
    //     `disableTypeChecked` pair.
    //
    // Workaround, same as `@vue/eslint-config-typescript`:
    //   1. Turn off `projectService` on sfcTsxScope so the parser drops
    //      out of the jsx=false lock and respects `ecmaFeatures.jsx`.
    //   2. Apply `tseslint.configs.disableTypeChecked` on the same scope
    //      to off every rule that calls `getParserServices()` — without
    //      projectService they'd error at runtime.
    // Net effect: TSX content in a Vue SFC parses and lints, but the
    // type-aware TS rules don't cover it. Non-type-aware TS rules still
    // apply. This is the best possible trade-off today.
    blocks.push({
      files: sfcTsxScope,
      languageOptions: {
        parserOptions: {
          ecmaFeatures: { jsx: true },
          project: false,
          projectService: false,
        },
      },
      name: 'unicute/vue/sfc-tsx',
    })
    const disable = tseslint.configs.disableTypeChecked
    const disableBlocks = Array.isArray(disable) ? disable : [disable]
    const mergedDisableRules = {}
    for (const b of disableBlocks) {
      if (!b?.rules) continue
      Object.assign(mergedDisableRules, b.rules)
      blocks.push({
        files: sfcTsxScope,
        name: 'unicute/vue/sfc-tsx-disable-typechecked',
        rules: b.rules,
      })
    }
    // Revive core-rule counterparts that the typescript config (or
    // rule-diff overrides) had off'd in favor of now-disabled TS rules.
    // Without this, sfcTsx scope ends up with gaps where neither version
    // of a rule (TS nor core) is active.
    const revived = computeRevivedCoreRules(mergedDisableRules)
    if (Object.keys(revived).length > 0) {
      blocks.push({
        files: sfcTsxScope,
        name: 'unicute/vue/sfc-tsx-revive-core',
        rules: revived,
      })
    }
  }

  // `vue/block-lang` — one of the few vue decisions managed in code rather
  // than rule-diff/vue.json. Baseline: every `<script>` must be
  // `lang="ts"`; if the SFC is inside `sfcTsxScope` the narrower override
  // below flips that to `lang="tsx"`. `allowNoLang: false` closes the
  // "forgot to write lang=" loophole (the SFC would otherwise be parsed
  // as plain JS). Ordering: generic block first, sfcTsx override last,
  // flat-config later-wins picks the right variant per file.
  blocks.push({
    files: scope,
    name: 'unicute/vue/block-lang',
    rules: {
      'vue/block-lang': ['error', { script: { allowNoLang: false, lang: 'ts' } }],
    },
  })
  if (sfcTsxScope.length > 0) {
    blocks.push({
      files: sfcTsxScope,
      name: 'unicute/vue/block-lang-tsx',
      rules: {
        'vue/block-lang': ['error', { script: { allowNoLang: false, lang: 'tsx' } }],
      },
    })
  }

  blocks.push(...overridesBlock('vue', scope))

  if (a11y) {
    const a11yRec = vueA11y.configs?.['flat/recommended']
    const a11yBlocks = Array.isArray(a11yRec) ? a11yRec : [a11yRec]
    for (const b of a11yBlocks) {
      if (!b) continue
      blocks.push({ ...b, files: scope, name: 'unicute/vuejs-accessibility' })
    }
    blocks.push(...overridesBlock('vuejs-accessibility', scope))
  }
  return blocks
}
