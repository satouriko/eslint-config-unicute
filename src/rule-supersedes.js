/**
 * Hand-maintained "semantic supersedes" — rule pairs where enabling rule A
 * makes rule B redundant or actively conflict, but the upstream plugins
 * haven't declared the relationship via `meta.docs.extendsBaseRule`.
 *
 * `baseRuleFor()` in `src/configs/_overrides.js` handles the *declared*
 * extendsBaseRule case (26 typescript-eslint rules). This table captures
 * everything else, and `compileOverrides` auto-offs each victim on the
 * same category's scope when its superseder is enabled.
 *
 * Sources I survey when adding entries:
 *   1. Upstream's own `meta.replacedBy` (strongest signal — plugin authors
 *      explicitly say "use X instead of Y").
 *   2. TS-aware rules that cover a core rule with strictly more info.
 *   3. Duplicates: two plugins ship the same check under different names.
 *   4. Broader plugin rules that subsume narrower ones.
 *
 * `'off'` severity is always safe in ESLint flat config (skips plugin
 * resolution), so emitting a cross-plugin off for an unregistered plugin
 * is a no-op rather than an error. That lets us auto-off across plugin
 * boundaries without worrying about load order.
 *
 * Map shape: enabled-rule-id → list of rule IDs it supersedes.
 */

/** @type {Record<string, string[]>} */
export const SUPERSEDES = {
  // ── Upstream-declared replacements (TS's own `meta.replacedBy`) ────────
  // typescript-eslint marks these old rules as deprecated and points at
  // the new one. We encode the replacement so enabling the new rule
  // auto-offs the old one — useful when a ref preset still registers the
  // deprecated version.
  '@typescript-eslint/ban-ts-comment': ['@typescript-eslint/prefer-ts-expect-error'],
  '@typescript-eslint/no-empty-object-type': ['@typescript-eslint/no-empty-interface'],
  '@typescript-eslint/no-require-imports': ['@typescript-eslint/no-var-requires'],
  'perfectionist/sort-intersection-types': ['@typescript-eslint/sort-type-constituents'],
  'perfectionist/sort-union-types': ['@typescript-eslint/sort-type-constituents'],

  // ── TS-aware successors to core rules ─────────────────────────────────
  // The TS rule understands types and replaces an AST-only core rule. Not
  // usually marked `extendsBaseRule` because the TS version typically
  // catches strictly more and behaves differently on untyped code — but
  // in a TS codebase you want one or the other, not both.

  // Identifier naming DSL — covers camelcase and friends at config level.
  '@typescript-eslint/naming-convention': ['camelcase', 'id-denylist', 'id-length', 'id-match', 'no-underscore-dangle'],

  // Exhaustive switch on discriminated unions; in typed code the `default`
  // branch is usually undesirable (it defeats exhaustiveness).
  '@typescript-eslint/switch-exhaustiveness-check': ['default-case', 'default-case-last'],

  // TS-aware `return-await`; core `no-return-await` was deprecated by
  // ESLint itself in v7 in favor of returning awaits for proper stacktrace
  // behavior in async functions.
  '@typescript-eslint/return-await': ['no-return-await'],

  // Forbid aliasing `this` at all, rather than enforcing one chosen alias.
  '@typescript-eslint/no-this-alias': ['consistent-this'],

  // TS's no-deprecated uses the type system to flag every usage of
  // anything marked @deprecated; import-x's version only catches
  // imports of deprecated modules — a strict subset.
  '@typescript-eslint/no-deprecated': ['import-x/no-deprecated'],

  // ── Duplicates between plugins — direction matches compose order ──────
  // Multiple plugins ship the same check. In unicute's compose order
  // (see `src/index.js`), typescript-eslint is loaded AFTER import-x and
  // unicorn, so when both sides register a rule on the same scope the TS
  // version wins the later-block-wins merge. Encode that reality: the TS
  // rule supersedes its import-x / unicorn counterpart, not the other
  // way. Enabling the TS side explicitly auto-offs the duplicate.

  '@typescript-eslint/consistent-type-imports': ['import-x/consistent-type-specifier-style'],
  '@typescript-eslint/prefer-includes': ['unicorn/prefer-includes'],
  '@typescript-eslint/prefer-string-starts-ends-with': ['unicorn/prefer-string-starts-ends-with'],
  '@typescript-eslint/prefer-find': ['unicorn/prefer-array-find'],
  '@typescript-eslint/prefer-for-of': ['unicorn/no-for-loop'],

  // ── Broader rule supersedes narrower one ───────────────────────────────

  // unicorn/prefer-module bans CommonJS wholesale (`module.exports`,
  // `__dirname`, `__filename`, `require`, …). TS's no-require-imports
  // and its deprecated cousin only target `require()` specifically.
  'unicorn/prefer-module': ['@typescript-eslint/no-require-imports', '@typescript-eslint/no-var-requires'],

  // perfectionist/sort-classes is a full member-ordering DSL; TS's
  // member-ordering is the older, more limited option.
  'perfectionist/sort-classes': ['@typescript-eslint/member-ordering'],

  // perfectionist/sort-imports is the modern replacement for core
  // sort-imports (named imports only) and import-x/order (different
  // grouping model). Pick one.
  'perfectionist/sort-imports': ['sort-imports', 'import-x/order'],
  'perfectionist/sort-named-imports': ['sort-imports'],

  // eslint-plugin-unused-imports breakdown (verified empirically via lint,
  // and by reading `dist/index.js` — `makePredicate(isImport)` filters
  // reports from the core no-unused-vars implementation by whether the
  // node's parent is an ImportSpecifier):
  //
  //   core / @typescript-eslint `no-unused-vars` : imports + vars + params
  //   unused-imports/no-unused-vars              : vars + params only (filters out imports)
  //   unused-imports/no-unused-imports           : imports only, with auto-fix
  //
  // So the two `unused-imports/*` rules together cover the same ground as
  // core `no-unused-vars`, with the imports side gaining auto-fix. The
  // canonical setup is: enable BOTH `unused-imports/*`, turn off core
  // (and @typescript-eslint) `no-unused-vars` to avoid duplicate reports
  // on imports.
  //
  // `unused-imports/no-unused-vars` alone covers vars/params but not
  // imports, so it isn't a strict superset — but combined with
  // `unused-imports/no-unused-imports` (which has no auto-off target
  // it clean-makes redundant either) the pair supersedes core. Encode
  // it on `no-unused-vars` side since that's the side people actually
  // reach for first; `no-unused-imports` is nearly always paired with
  // it and the reverse direction is handled manually.
  'unused-imports/no-unused-vars': ['no-unused-vars', '@typescript-eslint/no-unused-vars'],

  // ── regexp plugin vs core ─────────────────────────────────────────────
  // eslint-plugin-regexp's AST-level regex analysis subsumes the core
  // regex rules. Upstream doesn't declare the relationship, but its
  // recommended preset already off's the core counterpart — encode it
  // so enabling the plugin rule explicitly makes the supersede visible
  // on the dashboard and is preserved across preset drift.
  'regexp/no-invalid-regexp': ['no-invalid-regexp'],
  'regexp/no-useless-backreference': ['no-useless-backreference'],
  'regexp/no-control-character': ['no-control-regex'],
  'regexp/no-empty-character-class': ['no-empty-character-class'],

  // ── unicorn plugin vs core ────────────────────────────────────────────
  // Same pattern — unicorn's recommended preset hard-offs these core
  // rules because it provides smarter replacements (e.g. its
  // no-nested-ternary allows a single level of nesting with parens).
  'unicorn/no-nested-ternary': ['no-nested-ternary'],
  'unicorn/no-negated-condition': ['no-negated-condition'],
}

/**
 * Inverse index: rule ID → list of rules that supersede it. Used for the
 * "superseded-by" chip on the victim's card.
 */
export const SUPERSEDED_BY = (() => {
  const out = {}
  for (const [superRule, victims] of Object.entries(SUPERSEDES)) {
    for (const v of victims) {
      ;(out[v] ??= []).push(superRule)
    }
  }
  return out
})()
