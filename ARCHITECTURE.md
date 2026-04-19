# unicute — architecture & workflow

> How this package is built, how rule decisions flow, and how to keep the
> config healthy over time. Read this before touching anything non-trivial.

## TL;DR

unicute is a self-composed flat ESLint config. It loads ~25 plugins'
**recommended presets verbatim**, and layers **per-category unicute
decisions** on top — stored as JSON on disk under `rule-diff/*.json`, plus
a handful of code-managed exceptions baked into `src/configs/*.js`.
A companion dashboard (`pnpm decide`) enumerates every available rule,
probes how four reference configs (antfu / sxzz / standard / airbnb)
treat it, compares against a saved baseline to detect drift, and writes
decisions back to disk.

Terminology:

- **unicute decision** — an opinion unicute ships (either in
  `rule-diff/*.json` or, for a few special cases, in `src/configs/*.js`).
- **user config** — whatever the downstream project passes to
  `unicute(options, ...userConfigs)`. Never call this a "user decision".

---

## Layer cake

unicute resolves a file's rules in five layers, applied in order (later
wins):

```
┌──────────────────────────────────────────────────────────────────────┐
│ 5. User config blocks (passed to unicute() by the caller)            │  highest
├──────────────────────────────────────────────────────────────────────┤
│ 4. unicute decisions in rule-diff/*.json                             │
├──────────────────────────────────────────────────────────────────────┤
│ 3. unicute decisions hard-coded in src/configs/*.js                  │
│    (code-managed rules: no-restricted-globals, vue/block-lang)       │
├──────────────────────────────────────────────────────────────────────┤
│ 2. Plugin recommended presets (scoped to the files each plugin       │
│    covers — determined by file glob in src/configs/*.js)             │
├──────────────────────────────────────────────────────────────────────┤
│ 1. Ignores + ESLint core languageOptions setup                       │  lowest
└──────────────────────────────────────────────────────────────────────┘

Prettier runs as the very last layer, separately — it's a formatter,
not a rule source. See src/configs/prettier.js for the details.
```

Key invariant: **src/configs/\*.js mostly doesn't encode rule opinions**.
Each config file loads its plugin's recommended preset, scopes it to the
right file globs, and appends `overridesBlock(category, scope)` which
reads `rule-diff/{category}.json`. The only exceptions are the
**code-managed rules** — a short, documented list of cases where the
opinion only makes sense attached to a library (e.g.
`no-restricted-globals` fed by `confusing-browser-globals`; `vue/block-lang`
which needs access to `sfcTsxScope`). Each exception carries a block
comment explaining why it can't live in JSON.

---

## Files & responsibilities

```
src/
├── index.js             orchestrator — reads options, composes the final array
├── index.d.ts           public type definitions
├── utils.js             isPackageExists, hasPnpmWorkspace, GLOB_* constants
├── rule-supersedes.js   hand-maintained semantic-supersedes table (see below)
└── configs/
    ├── _overrides.js    loads rule-diff/{category}.json, compiles into a rules block;
    │                    handles extension-rule auto-off (baseRuleFor) + SUPERSEDES auto-off
    ├── ignores.js       .gitignore + common build-artifact ignores
    ├── javascript.js    @eslint/js recommended (all source) + code-managed
    │                    `no-restricted-globals` via `confusing-browser-globals`;
    │                    scopes `sourceType: 'commonjs'` + `globals.commonjs` to
    │                    `.cjs`/`.cts` so CJS files don't lint as modules
    ├── typescript.js    typescript-eslint strictTypeChecked (.ts/.tsx/.vue/.svelte)
    │                    + locked-in `projectService: true`
    ├── jsx.js           parserOptions.ecmaFeatures.jsx on .jsx/.tsx
    ├── react.js         @eslint-react + optional eslint-plugin-jsx-a11y
    ├── vue.js           eslint-plugin-vue + optional vuejs-accessibility;
    │                    `sfcTsx` enables JSX in <script> + applies
    │                    disableTypeChecked + a revive pass for core rules;
    │                    code-managed `vue/block-lang`
    ├── svelte.js        eslint-plugin-svelte, optional svelte/a11y-*
    ├── unicorn.js       eslint-plugin-unicorn recommended
    ├── regexp.js        eslint-plugin-regexp flat/recommended
    ├── imports.js       eslint-plugin-import-x flatConfigs.recommended +
    │                    perfectionist + unused-imports plugin registration +
    │                    `eslint-import-resolver-typescript` on TS-ish files
    │                    when `typescript` is on
    ├── perfectionist.js eslint-plugin-perfectionist plugin registration only
    ├── comments.js      @eslint-community/eslint-plugin-eslint-comments recommended
    ├── jsdoc.js         eslint-plugin-jsdoc flat/recommended (opt-in)
    ├── commonjs.js      scope-only overrides for .cjs / .cts (no native plugin)
    ├── node.js          eslint-plugin-n flat/recommended (opt-in)
    ├── testing.js       no-only-tests + optional vitest (test files)
    ├── tailwind.js      eslint-plugin-tailwindcss flat/recommended
    ├── jsonc.js         eslint-plugin-jsonc recommended-with-jsonc
    ├── yaml.js          eslint-plugin-yml flat/standard
    ├── toml.js          eslint-plugin-toml flat/standard
    ├── pnpm.js          eslint-plugin-pnpm (json + yaml)
    └── prettier.js      all formatting via a single `prettier/prettier` rule —
                         see "Prettier integration" below

scripts/
├── rule-diff.js         decision dashboard backend (HTTP server)
├── dashboard.html       decision dashboard UI (template, __DATA__ replaced)
├── rule-equivalence.js  unicute-rule → ref-rule aliases for cross-ref lookup
└── README.md            usage notes

rule-diff/
├── javascript.json      │
├── typescript.json      │
├── unicorn.json         │
├── imports.json         │  unicute decisions per category — committed to git.
├── perfectionist.json   │  Shape documented below. hook-protected against
├── ... (one per cat.)   │  tool writes (see .claude/hooks/protect-rule-diff.js).
├── .baseline.json       drift snapshot (plugin versions, per-rule recommended
│                        levels, ref alias resolutions at last decide). Commit.
└── index.html           regenerated on every GET / of the dashboard. Gitignored.

.claude/
├── settings.json        Claude Code project-scope settings registering the hook
└── hooks/
    └── protect-rule-diff.js
                         PreToolUse guard: blocks tool-level writes to
                         rule-diff/*.json. Real writes only flow through
                         the dashboard's HTTP PUT handler.
```

---

## Options API (consumer-facing)

```ts
import unicute, { globals } from 'eslint-config-unicute'

unicute(firstArg?, ...userConfigs)
```

`firstArg` mixes unicute options with a flat-config block (antfu-style).
Unknown keys become a user config layer, applied before any later
`userConfigs`.

| Option        | Default                           | Notes                                                                                                                     |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gitignore`   | `true`                            | Read `.gitignore` into ignore list                                                                                        |
| `typescript`  | auto-detect `typescript`          | Applies strictTypeChecked; locks `projectService: true`. Also wires `eslint-import-resolver-typescript` in imports scope. |
| `react`       | auto-detect `react`               | `boolean \| { files?, a11y? }`                                                                                            |
| `vue`         | auto-detect `vue`                 | `boolean \| { files?, sfcTsx?, a11y? }`                                                                                   |
| `svelte`      | auto-detect `svelte`              | `boolean \| { a11y? }`                                                                                                    |
| `tailwindcss` | auto-detect `tailwindcss`         |                                                                                                                           |
| `vitest`      | auto-detect `vitest`              |                                                                                                                           |
| `node`        | `false` (**opt-in**)              | `boolean \| glob \| glob[]`                                                                                               |
| `jsdoc`       | `false` (**opt-in**)              | `eslint-plugin-jsdoc` recommended fires on any `/** */`; enable when the project commits to JSDoc as documentation        |
| `pnpm`        | auto-detect `pnpm-workspace.yaml` |                                                                                                                           |
| `prettier`    | `true`                            | `boolean \| PrettierOptions` — unicute owns the config. Severity is `warn`, not `error`                                  |

Notes on the design choices:

- **`react.files`** exists so React + Vue-tsx + Solid etc. can have
  disjoint scopes. unicute **does not auto-disambiguate** when multiple
  JSX frameworks are on.
- **`vue.sfcTsx`** enables JSX _parser_ support inside `.vue` SFC scripts.
  Because typescript-eslint/parser has a documented quirk
  (`.vue` + `parserOptions.project` forces `jsx: false`), unicute
  additionally turns off `projectService` on `sfcTsxScope` and applies
  `tseslint.configs.disableTypeChecked`, then revives the core-rule
  counterparts of the disabled type-aware rules (see "Vue sfcTsx" below).
- **`node`** must be opt-in — there's no reliable filesystem test for
  "this code runs on Node vs in a browser". `true` applies to all source;
  a glob / glob[] scopes to specific paths.
- **`jsdoc`** must be opt-in — `eslint-plugin-jsdoc`'s recommended set
  fires on every `/** */` block (alignment, multi-asterisks, tag-names …),
  but `/** */` isn't always _intended_ as JSDoc. Enable only when the
  project commits to JSDoc as its documentation layer.
- **`prettier`** ignores `.prettierrc` (we pass `usePrettierrc: false` to
  `eslint-plugin-prettier`). This is a feature, not a bug: the whole team
  shares one source of truth per unicute config. Severity is deliberately
  `warn`, not `error` — so a save can land even mid-way through a
  reformat, and CI gate-keeping can be configured separately.
- **`files` in `firstArg` is rejected** — `extractOptions` throws a clear
  error if it sees a `files` key at the top level. unicute options apply
  globally; `files` at the top would only scope the leftover user block,
  not the whole config, which is a common footgun. Put `files` in a
  separate config block passed as a later argument. (Same check antfu runs.)

---

## Categories (rule namespaces)

A **category** corresponds to a rule-ID namespace / prefix. There are 21
categories currently; each gets its own `rule-diff/{id}.json`:

| Category              | Covers rule IDs                                                        | File globs scope                       |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `javascript`          | core ESLint (no prefix)                                                | `GLOB_SRC`                             |
| `commonjs`            | _any rule_ (scope-only override)                                       | `.cjs` + `.cts`                        |
| `typescript`          | `@typescript-eslint/*`                                                 | TS + TSX + VUE + SVELTE                |
| `unicorn`             | `unicorn/*`                                                            | `GLOB_SRC`                             |
| `regexp`              | `regexp/*`                                                             | `GLOB_SRC`                             |
| `imports`             | `import-x/*` + `unused-imports/*` + import-side `perfectionist/sort-*` | `GLOB_SRC`                             |
| `perfectionist`       | `perfectionist/*` (non-import)                                         | `GLOB_SRC`                             |
| `comments`            | `@eslint-community/eslint-comments/*`                                  | `GLOB_SRC`                             |
| `jsdoc`               | `jsdoc/*`                                                              | `GLOB_SRC` (opt-in)                    |
| `node`                | `n/*`                                                                  | opt-in scope                           |
| `testing`             | `vitest/*` + `no-only-tests/*`                                         | test files                             |
| `react`               | `@eslint-react/*`                                                      | `.jsx` + `.tsx` (configurable)         |
| `jsx-a11y`            | `jsx-a11y/*` (sub-category of react)                                   | react's scope                          |
| `vue`                 | `vue/*`                                                                | `.vue` (configurable)                  |
| `vuejs-accessibility` | `vuejs-accessibility/*`                                                | vue's scope                            |
| `svelte`              | `svelte/*` (incl. `svelte/a11y-*`)                                     | `.svelte`                              |
| `tailwind`            | `tailwindcss/*`                                                        | `GLOB_SRC` + `.html`                   |
| `jsonc`               | `jsonc/*`                                                              | `.json` + `.jsonc` + `.json5`          |
| `yaml`                | `yml/*`                                                                | `.yaml` + `.yml`                       |
| `toml`                | `toml/*`                                                               | `.toml`                                |
| `pnpm`                | `pnpm/*`                                                               | `package.json` + `pnpm-workspace.yaml` |

The **`commonjs` category** is special: it has no native plugin and no
`enumerate()` — rules are pulled in as _foreign_ from other categories
via the dashboard's "+ add rule from another category" button. Any rule
decision put in `rule-diff/commonjs.json` applies only on `.cjs` / `.cts`
files, layered after the main chains. Typical use: a rule whose correct
stance differs under CJS (e.g. `import-x/no-useless-path-segments` with
`noUselessIndex: false` to match CJS's directory-index resolution).

**Category → config-file is many-to-many**. Example: the `imports` workflow
touches three namespaces (`import-x`, `unused-imports`, and a subset of
`perfectionist`) but lives in one file `src/configs/imports.js`. Each rule
still lives in exactly one category JSON determined by its prefix — no
overlap.

**Markdown files** are formatted by prettier but not linted by an
`@eslint/markdown` processor anymore. The processor was removed to
eliminate a parser/processor conflict that prevented prettier from
formatting markdown itself. You lose code-block linting in `.md`; you
gain straightforward prettier formatting.

---

## Override JSON format

Each category has a sibling JSON file. Example `rule-diff/unicorn.json`:

```json
{
  "unicorn/no-null": {
    "decision": "disable",
    "note": "we use null deliberately for DB sentinel values"
  },
  "unicorn/prevent-abbreviations": {
    "decision": "ignore",
    "note": "too noisy"
  },
  "unicorn/consistent-function-scoping": {
    "decision": "enable",
    "level": "warn",
    "options": [{ "checkArrowFunctions": false }]
  }
}
```

Per-rule schema:

- `decision`: `enable` | `disable` | `ignore` | `pending`
  - `pending` means "seen but not decided". Rules never appearing in the
    file are implicitly pending too.
  - `ignore` means "I saw this rule, chose to leave the plugin's
    recommended level alone". It's a distinct signal from pending
    ("haven't looked") — the dashboard filter respects the difference.
- `level`: `error` | `warn` — only when `decision === "enable"`; defaults
  to `error`.
- `options`: ESLint rule options array — only when `decision === "enable"`.
- `note`: free-form text (shown in the dashboard, committed to disk).

### Compilation (in `_overrides.js`)

Two-phase compile so the order of entries in the JSON doesn't matter:

**Phase 1 — user decisions**:

- `enable` → `[ruleId]: level` (or `[level, ...options]` if options set)
- `disable` → `[ruleId]: 'off'`
- `ignore` / `pending` → no emission; the plugin's recommended level
  stands.

**Phase 2 — auto-offs derived from each `enable`**:

- If the rule is a typescript-eslint extension rule (declared via
  `meta.docs.extendsBaseRule`), emit `[baseRule]: 'off'` — e.g.
  enabling `@typescript-eslint/dot-notation` turns off core
  `dot-notation` on the same scope.
- For every entry in `SUPERSEDES[ruleId]` (see `src/rule-supersedes.js`),
  emit `[victim]: 'off'` — e.g. enabling
  `@typescript-eslint/naming-convention` turns off `camelcase`,
  `id-denylist`, `id-length`, `id-match`, `no-underscore-dangle`.

Phase 2 never overwrites a decision the user made explicitly in phase 1.
If the user enables both a superseder and its victim in the same JSON,
both stay on — they asked for it.

Cross-plugin `off` in ESLint flat config is always safe: `'off'`
severity short-circuits plugin resolution, so referencing a rule whose
plugin isn't registered in the current scope is a no-op rather than an
error.

---

## Semantic supersedes

`src/rule-supersedes.js` holds a hand-curated table of rule pairs where
enabling one rule makes the other redundant or conflicting, but the
upstream plugins don't declare the relationship via `extendsBaseRule`.
Entries come from four sources:

1. **Upstream-declared** via `meta.replacedBy` (e.g.
   `@typescript-eslint/no-empty-object-type` replaces
   `@typescript-eslint/no-empty-interface`).
2. **TS-aware successors** to core rules (e.g.
   `@typescript-eslint/naming-convention` covers `camelcase`,
   `@typescript-eslint/switch-exhaustiveness-check` covers
   `default-case` / `default-case-last`,
   `@typescript-eslint/return-await` covers core `no-return-await`).
3. **Duplicates across plugins** (e.g.
   `@typescript-eslint/prefer-includes` covers `unicorn/prefer-includes`).
   Direction is chosen to match unicute's compose order —
   typescript-eslint loads after unicorn/import-x, so the TS version
   wins the later-block-wins merge; SUPERSEDES encodes it one-way to
   match reality.
4. **Broader plugin rules** that subsume narrower ones (e.g.
   `unicorn/prefer-module` covers `@typescript-eslint/no-require-imports`;
   `perfectionist/sort-classes` covers `@typescript-eslint/member-ordering`).

The table drives the phase-2 auto-off in `compileOverrides`, **and** it
drives the core-revive logic in `src/configs/vue.js` when sfcTsx is on
(see "Vue sfcTsx" below).

---

## Code-managed rules

A small, documented set of rules can't live in JSON because their
decision only makes sense attached to a library or to runtime-computed
options. These are hard-coded in `src/configs/*.js` and surface in the
dashboard as read-only with a "managed in code" badge.

Current list:

| Rule                    | File            | Why                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-restricted-globals` | `javascript.js` | Options are the 58 entries from the `confusing-browser-globals` package, each wrapped into `{ name, message }` so lint errors point to `window.<name>`. Serializing those into `rule-diff/javascript.json` would make the file unreadable; the only decision worth making is "yes, use the list". |
| `vue/block-lang`        | `vue.js`        | Requires `<script lang="ts">` globally; flips to `lang="tsx"` within `sfcTsxScope`. Options depend on sfcTsxScope membership, which is a compose-time value. Can't be expressed in a single JSON entry.                                                                                           |

`scripts/rule-diff.js` keeps a `CODE_MANAGED_RULES` Set in sync with
these. The dashboard renders code-managed rules without decision radios
/ editable options / override-scope dropdown — the only signals shown
are the current level, a "decision: enable/disable" chip matching the
ESLint-visible state, and a note pointing the user at `src/configs/`.

Reference configs can still be compared via the `diff` button; `apply`
is hidden (applying would write a conflicting entry to rule-diff).

---

## Vue sfcTsx

When `vue: { sfcTsx: true }` (or a glob), unicute lets `.vue` SFCs use
`<script lang="tsx">` with JSX content inside. Getting this to work is
non-trivial because of a typescript-eslint/parser quirk documented at
[parser README](https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/parser#parseroptionsecmafeaturesjsx):

> For "unknown" extensions (`.md`, `.vue`):
>
> - If `parserOptions.project` is _not_ provided, the `ecmaFeatures.jsx`
>   setting is respected.
> - If `parserOptions.project` **is** provided (i.e. type-aware rules),
>   the file is **always parsed as if `jsx` is `false`**.

So the default "enable JSX + run type-aware rules" combination
parse-errors on the TSX content. See `create-vue#123`.

`src/configs/vue.js` resolves this by emitting three extra blocks on
`sfcTsxScope` when sfcTsx is on:

1. **Parser config override** — sets `ecmaFeatures.jsx: true` _and_ sets
   `project: false` + `projectService: false`. Releases the parser's
   jsx=false lock.
2. **`tseslint.configs.disableTypeChecked`** — without
   `project`/`projectService`, the type-aware rules would fail at
   runtime with "You have used a rule which requires parserServices".
   `disableTypeChecked` turns every such rule off. Non-type-aware TS
   rules (e.g. `@typescript-eslint/no-shadow`) still apply on these
   files.
3. **Revive block** — for each rule the disableTypeChecked step just
   turned off, unicute reverses the auto-offs that
   `baseRuleFor`/`SUPERSEDES` originally applied. Example: if
   `@typescript-eslint/dot-notation` is off on sfcTsxScope,
   `dot-notation` (core) comes back on. If
   `@typescript-eslint/naming-convention` is off,
   `camelcase` / `id-denylist` / `id-length` / `id-match` /
   `no-underscore-dangle` come back on.

   Revive values follow the user's rule-diff decisions for each core
   rule where present (level + options preserved). If the user hasn't
   decided on the rule, revive emits `'error'` — matching what the TS
   version from strictTypeChecked would have done.

Result: TSX content in Vue SFCs parses and lints under most non-type-aware
rules; the type-aware coverage is lost on that scope specifically,
but the core-rule counterparts come back to patch the gap.

Non-sfcTsx `.vue` files (the 95% case) still get full type-aware
coverage — the revive logic is scoped to `sfcTsxScope`.

---

## Prettier integration

`src/configs/prettier.js` uses exactly one rule — `prettier/prettier`
from `eslint-plugin-prettier` — to format everything. No `format/prettier`
rule, no parallel rule chains.

### File types ESLint already parses

For JS / TS / JSX / TSX / Vue / Svelte / JSON / YAML / TOML, ESLint has
a native parser (from the corresponding plugin). The global
`prettier/prettier` block runs against these; prettier infers the parser
from the filename and plugin list.

For **TOML specifically**, prettier's core doesn't support it. unicute
loads `prettier-plugin-toml` into `options.plugins` unconditionally, and
a second block scoped to `.toml` overrides `prettier/prettier`'s options
with an explicit `parser: 'toml'` — because `eslint-plugin-prettier`
calls `prettier.getFileInfo` without plugins loaded, so inference would
fall back to `babel` and try to parse TOML as JS.

### File types ESLint has no parser for

For CSS / SCSS / LESS / HTML / GraphQL / Markdown / XML / SVG,
`eslint-plugin-format.parserPlain` is registered as the "parser" so
ESLint accepts the file, and a per-scope block overrides
`prettier/prettier`'s options with the correct `parser` + any plugin
(e.g. `@prettier/plugin-xml`).

### Plugin path resolution

`prettier-plugin-toml`, `prettier-plugin-svelte`, `@prettier/plugin-xml`
are passed to prettier as **absolute file paths** (via
`require.resolve(...)`). Two constraints forced this:

- ESLint's config system `structuredClone`s rule options; plugin module
  objects contain functions → DataCloneError. Plugins must be strings.
- Bare strings like `'prettier-plugin-toml'` work in hoisted layouts
  but fail silently in pnpm's symlinked one — prettier resolves them
  relative to its own install path.

Absolute paths clone fine AND resolve regardless of layout.

### Turning off conflicting eslint-plugin-{jsonc,yml,toml} rules

All three plugins ship stylistic rules that would double-enforce
formatting that prettier now owns. unicute applies:

- `eslint-plugin-jsonc` → its `flat/prettier` compat preset on
  `.json*` files.
- `eslint-plugin-yml` → its `flat/prettier` compat preset on
  `.yml` / `.yaml` files.
- `eslint-plugin-toml` → a hand-curated off list
  (`TOML_FORMAT_RULES_OFF`) on `.toml` files, because upstream has no
  prettier-compat preset (prettier doesn't natively support TOML).

Semantic rules — duplicate keys, invalid JSON numbers, TOML
`keys-order` / `tables-order`, etc. — stay active.

---

## Import resolver

When `typescript` is on (auto-detected or passed `true`),
`src/configs/imports.js` registers
`eslint-import-resolver-typescript`, scoped to `.ts/.tsx/.vue/.svelte`
(not pure `.js`, so `eslint.config.js` and similar config files don't
get their imports routed through tsconfig paths).

Options:

- `alwaysTryTypes: true` — lets import-x find `@types/*` packages even
  for runtime imports.
- `project: ['**/tsconfig.json', '**/tsconfig.*.json']` — picks up the
  union of all project tsconfigs (monorepos), plus sub-tsconfigs like
  `tsconfig.app.json` / `tsconfig.node.json` that Vite/Nuxt/Astro
  scaffold.

Users can override either option by passing a user-config block that
redefines `settings['import-x/resolver-next']`.

---

## The decision dashboard (`pnpm decide`)

### What it does

1. **Enumerate rules** — walks `plugin.rules` for every installed
   plugin + core builtin rules. Gets the complete universe, not just
   recommended ones.
2. **Probe unicute** — runs `ESLint#calculateConfigForFile` against
   per-category probe files. The probe result is the current effective
   rule state (after compose + overrides) for each rule.
3. **Probe the plugin's own recommended preset** — separate probe so
   the dashboard can show "recommended: X" independent of unicute's
   effective state.
4. **Probe reference configs** — antfu, sxzz, neostandard (shown as
   `standard`), and `eslint-config-airbnb-extended` (as `airbnb`), each
   with the same probe file. `@vue/eslint-config-standard` and
   `@vue/eslint-config-airbnb` are layered in for vue-aware comparison.
   Rule prefixes are normalized via `REF_PREFIX_RENAMES` (e.g. antfu's
   `ts/*` → `@typescript-eslint/*`).
5. **Resolve ref aliases** — when a direct rule-name match fails in a
   ref's effective rules, `scripts/rule-equivalence.js` provides an
   alias table to try semantic equivalents (e.g.
   `@eslint-react/jsx-key-before-spread` ↔ `react/jsx-key`).
6. **Compare against baseline** (`rule-diff/.baseline.json`) — emit
   drift alerts for upstream changes since the last Save.
7. **Serve the dashboard** at `http://localhost:8080/` with the full
   payload embedded. Live read/write endpoints allow Save to flush
   decisions back to disk.

Multi-file probes are supported — for `pnpm` (rules across
`package.json` + `pnpm-workspace.yaml`), the backend probes both and
takes the union of rule levels.

### Drift detection

`.baseline.json` stores a compact snapshot of upstream state at the last
Save:

```jsonc
{
  "plugins": {
    "eslint-plugin-unicorn": { "version": "64.0.0" },
    "@typescript-eslint/eslint-plugin": { "version": "8.58.2" },
  },
  "refs": {
    "antfu": {
      "version": "8.2.0",
      "resolvedAliases": {
        "@eslint-react/jsx-key-before-spread": "react/jsx-key",
      },
    },
  },
  "rules": {
    "javascript": { "no-foo": { "recommended": "error", "deprecated": false } },
  },
}
```

`computeDrift` emits the following alert types. **Critical**: plugin
version-gated detection for `new-rule` / `rule-retired` — upstream has
to actually change versions for these to fire. This avoids false
positives when the baseline is incomplete (e.g. partial, pre-existing).

| Alert type            | Fires when                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin-upgraded`     | A tracked plugin's version changed since baseline                                                                                                                                                                        |
| `recommended-changed` | A tracked rule's `recommended` level differs from baseline (no version gate)                                                                                                                                             |
| `deprecated`          | A rule that wasn't deprecated in baseline is deprecated now                                                                                                                                                              |
| `new-rule`            | A tracked category has a new rule; **gated on the category's plugin version actually changing**                                                                                                                          |
| `rule-retired`        | A rule present in baseline is gone now; **same version gate**                                                                                                                                                            |
| `alias-lost`          | A ref alias recorded in baseline no longer resolves                                                                                                                                                                      |
| `option-invalid`      | A rule-diff entry's options failed ESLint's schema validation during probe — message names the rule, the offending key, the expected properties, and points at the `rule-diff/*.json` file that contains the stale entry |
| `probe-failed`        | Category probe threw for any other reason (e.g. parser module missing). First line of the error is included verbatim                                                                                                     |

### Probe-failure handling

ESLint's flat-config validator throws a multi-line JSON-Schema dump
when a rule's options don't match the rule's schema. `summarizeProbeError`
parses that into `{ rule, badProperty, expected, file }` and replaces the
wall-of-text `✗` spew in the terminal with a one-liner naming the rule
and the stale key. When one bad option blocks multiple category probes
(a typescript-eslint option typically cascades into typescript, testing,
react, jsx-a11y, vue, vuejs-accessibility, svelte, tailwind), the drift
alerts are deduped into a single `option-invalid` entry that lists the
affected categories in the message.

**Alias-lost suppression**: when a category probe fails, its rule set
is missing from `current.refs.*.resolvedAliases`. Without a guard this
would emit an `alias-lost` alert for every ref × every rule native to
the failed category. `computeDrift` skips alias-lost for any rule whose
native category is in `current.failedCategories` — failed probes don't
pretend aliases are lost, only that they couldn't be evaluated.

**Foreign-rule suppression**: `recommended` and `deprecated` are
plugin-level attributes of a rule, but each category's
`recommendedPreset()` only probes its own plugin — so for a rule pulled
into a non-native category (`jsdoc/require-jsdoc` staged under
`commonjs`, say), the per-category probe produces a meaningless `null`
and any disagreement with baseline would fire a spurious
`recommended-changed` alert. Drift checks skip any rule whose native
category differs from the one being probed; the rule's own native entry
is the single source of truth for its upstream state.

The UI surfaces all alerts in a top alert bar; each rule-scoped alert
also marks its rule with a `drift` chip and bumps it into "Needs action"
regardless of its decision state.

### Dashboard UI

**Sidebar**: one entry per category with a pending-count badge; a
trailing `+ add rule from another category` button opens the rule
picker for cross-scope overrides.

**Header**: title + `generated <timestamp>` meta, plus two click-to-expand
detail popovers:

- **`N refs`** — lists each reference config and the actual packages
  behind it (`standard` = `neostandard` + `@vue/eslint-config-standard`;
  `airbnb` = `eslint-config-airbnb-extended` + `@vue/eslint-config-airbnb`).
  Driven by `DATA.refPackages` (per-ref array of `{ name, version }`).
- **`N packages`** — every eslint plugin unicute loads, flat.

**Toolbar filters** (compose with AND):

- Segmented: `Needs action` / `unicute decisions` / `All`
- `Diff with…` dropdown: scope to rules where unicute disagrees with
  `recommended` or a ref. Auto-expands diff panels on every visible
  card — no need to click through one at a time.
- `Hide ignored` checkbox: suppress rules marked `decision: ignore`
- `Deprecated: all / hide / only` select
- **Rule count** — `<N> of <total>` on the right side of the toolbar
  live-updates with every filter change, so you can tell at a glance
  how large the current slice is without scrolling.

**Rule card**: rule ID + doc link, plus chips for unicute level,
recommended level, deprecated, type-aware, extendsBaseRule, decision
state, drift, supersedes / superseded-by relations, foreign (for rules
added via cross-scope override), and managed-in-code (for code-managed).

Ref chips show `antfu: error` / `sxzz: off` / `standard: —` / `airbnb: error`
with an `apply` button to copy the ref's level+options into the local
decision, and a `diff` button to expand a comparison panel. A `≠opt`
marker highlights cases where unicute and a ref agree on severity but
have different options payloads.

**Diff semantics** (used by both the `≠opt` marker and the diff panel):

- `canonicalStringify(value)` sorts object keys and array elements before
  emitting — so payloads that differ only in key/element order don't
  false-positive as diffs (matters for `no-restricted-globals`'s
  60-entry bag, for example).
- When arrays do genuinely differ, `jsonDiff` walks them as **multisets**
  rather than index-wise: one row per element present on only one side,
  not one row per shifted index. Keeps the diff panel legible even when
  one side is a re-ordered superset of the other.

**Cross-scope override**: each card has an "Also override in…"
dropdown that clones the current decision into another category's JSON
— useful for applying a core-rule override to only `.jsx/.tsx` files
via the `react` category, or only `.vue` files via `vue`.

**Read-only code-managed rules**: the card renders a labelled pill for
`decision: enable/disable` + `level: error/warn` instead of decision
radios, with a note that the decision lives in `src/configs/`.

### Save flow

1. For each dirty category, rebuild the target JSON content: start from
   the current on-disk state, apply dirty edits, strip pending.
2. `PUT /rule-diff/{category}.json` for each.
3. `PUT /rule-diff/.baseline.json` with a fresh snapshot to resync
   drift detection.

The Save button label shows the dirty count. Dashboard's filter
classification uses the **saved** decision only — mid-edit a rule
doesn't jump between buckets; reclassification happens after Save.

### Filter semantics

`needsReview(rule) = (rule.unicuteLevel == null)` — a rule is orphan /
needs-review only when the composed unicute config has no level for it
(no preset touches it, no decision exists). Rules covered by a plugin
preset other than the category's own (e.g. `prefer-regex-literals` is
a core rule but `eslint-plugin-regexp`'s flat/recommended enables it)
don't count as orphan.

- **Needs action** = orphan with no decision, OR drifted (either way
  user attention is warranted).
- **unicute decisions** = any non-pending decision exists, regardless
  of orphan status. Code-managed rules go here.
- **All** = everything.

---

## Protection hook

`.claude/hooks/protect-rule-diff.js` is a Claude Code PreToolUse hook
that blocks tool-level writes to `rule-diff/*.json`. It exists because
Claude once clobbered real user decisions by "restoring" what it
thought was the previous state — a hook is the only reliable guard.

It blocks:

- `Write` / `Edit` / `MultiEdit` / `NotebookEdit` whose target path
  matches `*/rule-diff/*.json`.
- `Bash` commands using redirect / tee / mv / cp / rm / unlink /
  truncate / install / ln / sed -i against `rule-diff/*.json`.
- `Bash` rm -r / rmdir / mv on the `rule-diff/` directory itself.

It allows:

- Reads (cat / head / grep / diff / …).
- Writes to non-`.json` files inside `rule-diff/` (e.g. `index.html`
  regenerated by the dashboard).
- The dashboard's own writes via HTTP PUT — those go through a
  spawned Node process, not tool calls.

`.claude/settings.json` registers the hook on `Write | Edit | MultiEdit |
NotebookEdit | Bash`.

---

## Typical workflows

### Initial setup

```bash
pnpm install
pnpm decide
# open http://localhost:8080/
# walk through each category, set decisions, save
# commit rule-diff/*.json + rule-diff/.baseline.json
```

### Routine editing

```bash
pnpm decide
# if no upstream changed: 0 drift alerts
# edit what you want, save, commit
```

### Plugin upgrade

```bash
# someone bumps eslint-plugin-unicorn in package.json
pnpm install
pnpm decide
# dashboard alerts:
#   ⚠ eslint-plugin-unicorn upgraded (64.0.0 → 65.0.0)
#   ⚠ 3 new rules in unicorn — pending decision
#   ⚠ 1 recommended level changed: unicorn/prefer-set (warn → error)
# review in Needs action, decide, save, commit (includes updated baseline)
```

### Ref config upgrade

```bash
# same flow, but via the ref side of baseline
#   ⚠ 5 alias mappings lost in antfu
#   ⚠ 2 unicute rules have no ref alias — maintenance needed
```

Fix is usually updating `scripts/rule-equivalence.js`. Check whether
the ref renamed / removed a rule, update the alias table, re-run
`pnpm decide` to confirm alerts clear.

---

## Versioning policy

**Rule-providing deps are pinned to exact versions** (no `^` or `~`):

```jsonc
{
  "dependencies": {
    "eslint-plugin-unicorn": "64.0.0", // rule provider, pinned
    "@typescript-eslint/eslint-plugin": "8.58.2", // rule provider, pinned
    "confusing-browser-globals": "1.0.11", // data for a code-managed rule, pinned
    "prettier-plugin-toml": "2.0.6", // pinned
    "eslint-import-resolver-typescript": "4.4.4", // pinned
    // ...
    "vue-eslint-parser": "^10.4.0", // parser, loose
    "jsonc-eslint-parser": "^3.1.0", // parser, loose
    "globals": "^17.5.0", // data only, loose
  },
}
```

Why: a minor version bump of a rule plugin can silently change a rule's
recommended level or add new rules. Pinning forces the change to
surface as an explicit `package.json` edit, which triggers the drift
workflow. Parsers don't own rule opinions, so they can track semver
freely.

---

## Testing & dogfood

`eslint.config.js` at the repo root calls `unicute()` — the package
lints its own source. `pnpm lint` runs this. Remaining errors represent
plugin defaults that haven't been overridden yet in `rule-diff/*.json`;
they're the same errors a fresh consumer would see.

---

## Non-goals

- **Does not support ESLint legacy config** (`.eslintrc.*`). Flat-config
  only.
- **Does not auto-disambiguate overlapping framework scopes**. If both
  React and Vue-TSX target `.tsx`, the consumer passes disjoint `files`
  options.
- **Does not wrap sxzz / antfu / any other config**. unicute is
  self-composed; the reference configs are only consulted by the
  dashboard for comparison.
- **Does not attempt to make `.prettierrc` work**. Prettier config is
  passed via `unicute({ prettier: {...} })` only.
- **Does not lint markdown code blocks**. The `@eslint/markdown`
  processor was removed so prettier can own markdown formatting;
  code-in-docs isn't linted.

---

## Key invariants (don't break these)

1. No ad-hoc rule opinions in `src/configs/*.js`. Opinions belong in
   `rule-diff/*.json` unless the rule is on the
   `CODE_MANAGED_RULES` list, in which case a top-of-block comment
   must spell out why it can't live in JSON.
2. One JSON override file per rule-ID namespace (the prefix before `/`
   in a rule name; `javascript` for core). File name =
   `rule-diff/{category}.json`.
3. Rule-providing deps in `package.json` are **exact versions**.
   Parser / data-only / utility deps can use `^`.
4. `rule-diff/.baseline.json` is committed to git. It's the drift
   oracle.
5. Every option default is either `false` or the result of
   `isPackageExists(...)` — never `true` unconditionally, so
   `unicute()` with no args works for any project.
6. Prettier config is owned by unicute. `eslint-plugin-prettier` runs
   with `usePrettierrc: false`.
7. `src/index.d.ts` is the public-type source of truth; keep it in
   sync with `src/index.js`.
8. Never write to `rule-diff/*.json` from tool calls or hand-edits when
   the dashboard might have unsaved state. The hook enforces the
   Claude-side of this; humans stay disciplined on their own.
