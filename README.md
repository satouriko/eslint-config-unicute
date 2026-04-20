# unicute

> 🌸 **Unified and cute.** Uniform code, strictness that's just right.

[中文](./README.zh.md) · [Browse every decision →](https://satouriko.github.io/eslint-config-unicute/)

A TypeScript-first ESLint flat config. Zero config; assembles itself from your project.

---

## Install

```bash
pnpm add -D eslint prettier eslint-config-unicute
```

```js
// eslint.config.js
import unicute from 'eslint-config-unicute'
export default unicute()
```

Peer deps: `eslint ≥ 9.35`, `typescript ≥ 4.8.4`, `prettier ≥ 3.5`, `node ≥ 18.18` (the union of eslint 9's and 10's engine constraints).

> **Run formatting through ESLint, not Prettier directly.** unicute owns the Prettier config and runs Prettier inside ESLint via `eslint-plugin-prettier` — `eslint --fix` formats the whole project in one pass. Running `prettier --write` separately is redundant and can disagree with unicute's options (it reads `.prettierrc`, which unicute ignores).

---

## Out of the box

**Auto-assembles from your project.** unicute detects installed dependencies and enables the matching rule chains — one call is enough.

---

## How rules are chosen

Reasons to **turn a rule on**:

- **Best practice** — catches bugs, antipatterns, type errors.
- **Style consistency** — keep one way to write a given thing. Same spirit as Prettier. Prettier handles formatting; ESLint handles non-formatting style (e.g. whether to write the `public` keyword in TypeScript, `interface` vs `type` division of labor, type-import shape, and so on).

Reasons to **turn a rule off**:

- **Correctness protection** — the rule's auto-fix can introduce unintended runtime semantic differences. Most `prefer-*` rules fall in this bucket.
- **Syntactic freedom** — obviously harmless syntactic variation isn't prohibited (a canonical counter-example being airbnb's `no-plusplus`).

---

## Compared to other configs

A large portion of unicute's rule choices — switches, options, exception lists, naming conventions, etc. — is borrowed from these four configs:

- [**eslint-config-airbnb-extended**](https://github.com/airbnb/eslint-config-airbnb) — years of curation of core ESLint rule options, exception lists, and naming conventions (e.g. the `no-param-reassign` exception list for `acc` / `accumulator` / `e` / `ctx` / `req`).
- [**neostandard**](https://github.com/neostandard/neostandard) (the flat-config successor to standard) — core code-style conventions (no-semi, single-quote and other Standard traditions), plus some core ESLint rule calls. unicute keeps trailing commas because they're friendlier to diffs.
- [**antfu/eslint-config**](https://github.com/antfu/eslint-config) — flat-config-native design, per-project auto-detection, factory-function API; modern plugin selection (unicorn, import-x, regexp, etc.) and specific rule choices.
- [**@sxzz/eslint-config**](https://github.com/sxzz/eslint-config) — the overall pattern of using Prettier as the formatting layer; Prettier defaults (no-semi, single-quote, trailingComma 'all'); plugin selection and specific unicorn rule calls.

Every rule's current state and a live side-by-side diff against these four configs is browsable at **[satouriko.github.io/eslint-config-unicute](https://satouriko.github.io/eslint-config-unicute/)** — rebuilt on every push to `main`.

### vs airbnb-extended

Shared — both are opinionated, batteries-included configs with broad core ESLint coverage; **code style partially overlaps** (both use single-quote + multi-line trailing comma).

Different:

- **Semicolons**: airbnb requires them; unicute doesn't.
- **TypeScript**: airbnb picks TS rules à la carte (~47 rules, ~15 of them type-aware); unicute ships `strictTypeChecked + stylisticTypeChecked` in full — every type-aware rule both presets offer.
- **React plugin**: airbnb uses the legacy `eslint-plugin-react` (70+ rules covering prop-types, class-component patterns, etc.); unicute uses the modern `@eslint-react` (hooks-era).
- **Formatting ownership**: airbnb via `@stylistic/*`; unicute via Prettier.
- **Restrictions on harmless syntax**: airbnb bans `no-plusplus`, `no-bitwise`, `no-continue`, `no-await-in-loop`, `no-lonely-if`, `consistent-return`, etc.; unicute doesn't (see the "syntactic freedom" bullet above).

### vs neostandard

Shared — flat-config only, self-contained; **core code-style conventions are close** (no-semi, single-quote and other Standard traditions).

Different:

- **Scope**: neostandard stays lightweight — a handful of TS rules (~8, none type-aware) and not much framework / testing / docs coverage. unicute covers the whole stack: type-aware TS, modern frameworks, testing, docs, multiple config-file types.
- **Formatting ownership**: neostandard does it via `@stylistic/*`; unicute hands it to Prettier.
- **Trailing comma**: unicute uses `trailingComma: 'all'`; Standard traditionally uses no-trailing-comma (neostandard currently doesn't enforce it).

### vs antfu

Shared — flat-config only, framework auto-detection, substantial overlap on core plugins (typescript-eslint, unicorn, vue, etc.); **core code-style direction is aligned** (no-semi, single-quote, multi-line trailing comma).

Different:

- **TypeScript strictness**: antfu uses typescript-eslint's `recommended` preset (no type-aware); unicute uses `strictTypeChecked + stylisticTypeChecked`, type-aware fully on.
- **Formatting ownership**: antfu does formatting via `@stylistic/*`; unicute hands it to Prettier.
- **Import resolution and grouping**: unicute's import resolution is type-aware — it reads tsconfig paths / aliases via `eslint-import-resolver-typescript` (walking up to find tsconfigs in monorepos) and groups via `import-x/order` based on the resolved paths; antfu's import resolution is a different route.
- **Extras antfu ships by default that unicute doesn't**: `antfu/*` (antfu's own rules), `e18e` (ecosystem migration nudges), `command` (comment-based commands), etc.

### vs sxzz

Shared — flat-config only, framework auto-detection, **both use Prettier for formatting**, core code style matches exactly (no-semi, single-quote, trailing comma 'all'), substantial overlap on core plugins.

Different:

- **TypeScript strictness**: sxzz uses a more restrained typescript-eslint preset; unicute uses `strictTypeChecked + stylisticTypeChecked`, type-aware fully on.
- **unicorn `prefer-*` / `no-useless-*` rules that nudge API swaps**: sxzz turns most of this family on wholesale; unicute picks case by case, weighing each rule's autofix for runtime semantic drift. The ones where the swap is genuinely safe (`prefer-math-min-max`, `prefer-set-has`, `prefer-node-protocol`, etc.) stay on; rules with subtle runtime differences (`prefer-at`, `prefer-includes`, `prefer-string-replace-all`, `prefer-number-properties`, `prefer-spread`, …) stay off.
- **Import resolution and grouping**: unicute's import resolution is type-aware — reads tsconfig paths / aliases via `eslint-import-resolver-typescript` (walking up to find tsconfigs in monorepos) for grouping; sxzz's import resolution is a different route.
- **Extras sxzz ships by default that unicute doesn't**: `de-morgan` (De Morgan's law rewrites), `baseline-js` (Web platform Baseline checks), `command`, plus sxzz's own `sxzz/*` rules.

---

## API

```ts
unicute(firstArg?, ...userConfigs)
```

Every option is auto-detected from installed dependencies by default. Pass explicit values to override detection or tune behavior.

| Option        | Default     | Notes                                                                                            |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `typescript`  | auto-detect | strict + type-aware + `projectService: true`; pass `{ tsconfigRootDir }` to pin the project root |
| `react`       | auto-detect | `true \| { files?, a11y? }`                                                                      |
| `vue`         | auto-detect | `true \| { files?, sfcTsx?, a11y? }`                                                             |
| `svelte`      | auto-detect | `true \| { a11y? }`                                                                              |
| `tailwindcss` | auto-detect |                                                                                                  |
| `vitest`      | auto-detect |                                                                                                  |
| `node`        | `false`     | opt-in — `true \| glob \| glob[]`                                                                |
| `jsdoc`       | `false`     | opt-in — recommended rules fire on every `/** */`, not always desired                            |
| `pnpm`        | auto-detect | triggered by `pnpm-workspace.yaml`                                                               |
| `prettier`    | `true`      | `boolean \| PrettierOptions`                                                                     |
| `gitignore`   | `true`      | loads `.gitignore` into the ignore list                                                          |

`firstArg` also accepts arbitrary flat-config keys — unknown keys form a user config block (antfu-style):

```js
export default unicute({
  react: { a11y: true },
  files: ['scripts/**'],
  rules: { 'no-console': 'off' },
})
```

Additional arguments are appended to the end of the chain, so they override unicute's defaults per flat-config's later-wins order.

`.cjs` and `.cts` files are treated as CommonJS automatically — `sourceType: 'commonjs'` and the CommonJS globals are applied, so `require`, `module`, `__dirname` etc. don't trigger `no-undef`.

### `globals` re-export

`globals` (the canonical package of global-variable tables) is re-exported for convenience:

```js
import unicute, { globals } from 'eslint-config-unicute'

export default unicute(
  {},
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
)
```
