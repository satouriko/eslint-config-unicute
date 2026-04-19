/**
 * Hand-maintained aliases between unicute's rule IDs and the names the four
 * reference configs (antfu / sxzz / standard / airbnb) use.
 *
 * The dashboard uses `resolveRef()` below when looking up a unicute rule in
 * a reference config's effective rule set:
 *
 *   1. Direct name match on the unicute rule ID.
 *   2. Try each alias in order — first match wins (tagged "via alias: X").
 *   3. No match → `null` + the dashboard flags it for AI maintenance.
 *
 * When you add a rule here, keep it one-to-many: one unicute ID → list of
 * names the ref might use. A ref that disagrees with another ref is fine;
 * only direct alias ambiguity (one ref having the rule under two names at
 * once) would cause trouble, and that's vanishingly rare.
 *
 * AI maintenance workflow: when drift detection flags a lost alias or a
 * missing mapping, update this file and re-run `pnpm decide` until the
 * alerts clear.
 */

/** @type {Record<string, string[]>} */
export const ALIASES = {
  // @eslint-react uses nested prefixes; the legacy eslint-plugin-react (used
  // by antfu/airbnb/sxzz) keeps everything under `react/*` / `react-hooks/*`.
  '@eslint-react/dom/no-unknown-property': ['react/no-unknown-property'],
  '@eslint-react/dom/no-void-elements-with-children': ['react/void-dom-elements-no-children'],
  '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': ['react-hooks/set-state-in-effect'],
  '@eslint-react/hooks-extra/no-unnecessary-use-callback': ['react-hooks/exhaustive-deps'],
  '@eslint-react/hooks-extra/no-unnecessary-use-memo': ['react-hooks/exhaustive-deps'],
  '@eslint-react/jsx-key-before-spread': ['react/jsx-key'],
  '@eslint-react/jsx-no-duplicate-props': ['react/jsx-no-duplicate-props'],
  '@eslint-react/jsx-no-iife': ['react/jsx-no-useless-fragment'],
  '@eslint-react/jsx-uses-react': ['react/jsx-uses-react'],
  '@eslint-react/jsx-uses-vars': ['react/jsx-uses-vars'],
  '@eslint-react/no-array-index-key': ['react/no-array-index-key'],
  '@eslint-react/no-children-count': ['react/no-children-count', 'react/no-children-prop'],
  '@eslint-react/no-children-for-each': ['react/no-children-forEach'],
  '@eslint-react/no-children-map': ['react/no-children-map'],
  '@eslint-react/no-children-only': ['react/no-children-only'],
  '@eslint-react/no-children-prop': ['react/no-children-prop'],
  '@eslint-react/no-children-to-array': ['react/no-children-toArray'],
  '@eslint-react/no-clone-element': ['react/no-clone-element'],
  '@eslint-react/no-component-will-mount': ['react/no-deprecated'],
  '@eslint-react/no-component-will-receive-props': ['react/no-deprecated'],
  '@eslint-react/no-component-will-update': ['react/no-deprecated'],
  '@eslint-react/no-create-ref': ['react/no-deprecated'],
  '@eslint-react/no-direct-mutation-state': ['react/no-direct-mutation-state'],
  '@eslint-react/no-duplicate-key': ['react/jsx-key'],
  '@eslint-react/no-implicit-key': ['react/jsx-key'],
  '@eslint-react/no-missing-key': ['react/jsx-key'],
  '@eslint-react/no-string-refs': ['react/no-string-refs'],
  '@eslint-react/no-unsafe-component-will-mount': ['react/no-unsafe'],
  '@eslint-react/no-unsafe-component-will-receive-props': ['react/no-unsafe'],
  '@eslint-react/no-unsafe-component-will-update': ['react/no-unsafe'],
  '@eslint-react/no-unstable-context-value': ['react/jsx-no-constructed-context-values'],
  '@eslint-react/no-unstable-default-props': ['react/no-unstable-nested-components'],
  '@eslint-react/no-unused-class-component-members': ['react/no-unused-class-component-methods'],
  '@eslint-react/no-unused-state': ['react/no-unused-state'],
  '@eslint-react/no-use-context': ['react/no-deprecated'],

  // import-x is a fork of eslint-plugin-import; it kept every rule name.
  // All four refs still use the legacy `import/*` prefix.
  'import-x/default': ['import/default'],
  'import-x/export': ['import/export'],
  'import-x/first': ['import/first'],
  'import-x/named': ['import/named'],
  'import-x/namespace': ['import/namespace'],
  'import-x/newline-after-import': ['import/newline-after-import'],
  'import-x/no-absolute-path': ['import/no-absolute-path'],
  'import-x/no-cycle': ['import/no-cycle'],
  'import-x/no-default-export': ['import/no-default-export'],
  'import-x/no-duplicates': ['import/no-duplicates'],
  'import-x/no-dynamic-require': ['import/no-dynamic-require'],
  'import-x/no-empty-named-blocks': ['import/no-empty-named-blocks'],
  'import-x/no-extraneous-dependencies': ['import/no-extraneous-dependencies'],
  'import-x/no-mutable-exports': ['import/no-mutable-exports'],
  'import-x/no-named-as-default': ['import/no-named-as-default'],
  'import-x/no-named-as-default-member': ['import/no-named-as-default-member'],
  'import-x/no-named-default': ['import/no-named-default'],
  'import-x/no-self-import': ['import/no-self-import'],
  'import-x/no-unresolved': ['import/no-unresolved'],
  'import-x/no-useless-path-segments': ['import/no-useless-path-segments'],
  'import-x/no-webpack-loader-syntax': ['import/no-webpack-loader-syntax'],
  'import-x/order': ['import/order'],

  // unused-imports extends core no-unused-vars; refs may use either.
  'unused-imports/no-unused-imports': ['@typescript-eslint/no-unused-vars', 'no-unused-vars'],
  'unused-imports/no-unused-vars': ['@typescript-eslint/no-unused-vars', 'no-unused-vars'],
}

/**
 * Look up `unicuteRuleId` in a ref config's effective rules map. Returns
 *   { level, options, alias }
 * where `alias` is `null` on a direct hit, or the alias string that matched,
 * or the object is itself `null` if nothing matches.
 *
 * `refRules` is the effective rules dict for the ref (`{ 'rule-id': level }` —
 * values may be strings, numbers, or `[level, ...options]` arrays, matching
 * ESLint's config shape).
 * @param {string} unicuteRuleId
 * @param {Record<string, unknown>} refRules
 */
export function resolveRef(unicuteRuleId, refRules) {
  if (!refRules) return null
  if (unicuteRuleId in refRules) {
    return hit(refRules[unicuteRuleId], null)
  }
  const aliases = ALIASES[unicuteRuleId]
  if (aliases) {
    for (const alias of aliases) {
      if (alias in refRules) return hit(refRules[alias], alias)
    }
  }
  return null
}

/**
 * @param {unknown} value
 * @param {string | null} alias
 */
function hit(value, alias) {
  const [level, ...options] = Array.isArray(value) ? value : [value]
  return { alias, level: normalizeLevel(level), options }
}

/**
 * @param {unknown} level
 */
function normalizeLevel(level) {
  if (level === 0 || level === 'off') return 'off'
  if (level === 1 || level === 'warn') return 'warn'
  if (level === 2 || level === 'error') return 'error'
  return null
}
