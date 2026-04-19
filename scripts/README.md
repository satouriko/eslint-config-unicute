# scripts

## `rule-diff.js`

Starts a local dashboard at `http://localhost:8080/` for reviewing every
rule unicute loads and recording **unicute decisions** (what's on, what's
off, what options to pass) in `rule-diff/*.json`. The dashboard is the
sole authoring surface for those files — humans pick decisions in the
UI, hit **Save**, and `rule-diff/{category}.json` is written atomically.
Configs at runtime read the same JSON via
`src/configs/_overrides.js`.

See `../ARCHITECTURE.md` for how the pieces fit together.

### Usage

```bash
pnpm decide                 # node scripts/rule-diff.js
# or: node scripts/rule-diff.js --port 8123
```

On every run the tool:

1. Enumerates every rule in every plugin unicute wires up, grouped by
   category (see `CATEGORIES` in `rule-diff.js`).
2. Probes unicute + the reference configs (antfu / sxzz / standard /
   airbnb, plus `@vue/eslint-config-*` overlays for the vue category) on
   per-category probe files via `ESLint#calculateConfigForFile` — so the
   displayed levels are exactly what each config would emit for that
   file type.
3. Compares against `rule-diff/.baseline.json` and surfaces **drift**:
   plugin-version-gated `new-rule` / `rule-retired`, plus
   `recommended-changed`, `deprecated`, and `alias-lost`. Non-version-gated
   drift is suppressed to avoid spam when upstream hasn't actually moved.
   Probe errors (ESLint rejecting a stale `rule-diff/*.json` option) are
   surfaced as `option-invalid` alerts naming the rule, the offending
   key, the expected schema keys, and the file to fix — one alert per
   root cause, not one per affected category.
4. Serves the dashboard with PUT endpoints for `rule-diff/{category}.json`
   and `.baseline.json`. **Save** writes straight to disk; the HTML is
   regenerated on every GET `/` so the UI always reflects the latest
   saved state.

### Decision states (per rule)

```
pending — not yet reviewed; plugin's recommended level stands
enable  — unicute turns the rule on (optional level / options)
disable — unicute turns the rule off ("off")
ignore  — explicitly leave at plugin default (documented non-decision)
```

Two-phase compile in `src/configs/_overrides.js`:

- **Phase 1** — apply each rule's own `{ decision, level, options }`.
- **Phase 2** — auto-off counterparts:
  - `@typescript-eslint/*` extension rules (via `meta.docs.extendsBaseRule`)
    turn off their core base rule.
  - Rules listed in `src/rule-supersedes.js` turn off their semantic
    victims (e.g. `@typescript-eslint/prefer-includes` off's
    `unicorn/prefer-includes`).

The user never writes the off side by hand.

### Code-managed rules

A small allow-list of rules (see `CODE_MANAGED_RULES` in `rule-diff.js`)
is authored directly in `src/configs/*.js` rather than in
`rule-diff/*.json`. The dashboard renders them read-only with a
`code-managed` badge — the Apply button and editor are disabled. Current
members: `no-restricted-globals`, `vue/block-lang`. Add to the set when
a rule's options need structure the dashboard can't express cleanly.

### Reference aliases

Reference configs use different names for the same rule
(`@eslint-react/jsx-key` vs `react/jsx-key`, `antfu/*` vs unicute's
`style/*`, etc.). `rule-equivalence.js` holds a hand-maintained alias
table plus `REF_PREFIX_RENAMES` for bulk prefix mappings. When drift
flags a lost alias, update that file and re-run `pnpm decide`.

### Dashboard features

- **Header version popovers** — click `N refs` to see the actual packages
  behind each reference config (e.g. `standard` = `neostandard` +
  `@vue/eslint-config-standard`); click `N packages` for every eslint
  plugin unicute loads, with versions.
- **Rule count** — `<N> of <total>` at the right end of the toolbar
  updates with every filter change.
- **Category picker + rule picker** — quick jump to any loaded rule.
  Sidebar's `+ add rule from another category` brings any native rule
  into the current category's scope as a foreign entry. The scope-only
  `commonjs` category has no native rules of its own — populate it by
  adding rules from other categories (so their options apply only on
  `.cjs` / `.cts` files).
- **Filters** (compose with AND): `Needs action` / `unicute decisions` /
  `All` segmented, `Diff with…` ref dropdown, `Hide ignored` checkbox,
  `Deprecated: all / hide / only`.
- **Diff with `<ref>`** — side-by-side with any reference config, with
  auto-expanded diff panels on the rows that actually differ. Arrays
  are diffed as multisets (order-insensitive) and object key order is
  normalized, so order-only noise doesn't show up. Arrays of objects
  with an identity field (`name` / `selector` / `id` / `key`) are paired
  up by that field — so `no-restricted-globals`-style entries with a
  shared `name` but differing `message` show as one row with the inner
  message diff, not as unrelated add/remove pairs.
- **Also override in** — dropdown on each rule to copy a decision into
  another category's JSON (useful when the same rule id lives under
  multiple plugins).
- **Options editor** — auto-resizing textarea; per-rule validation
  against the rule's JSON schema before Save.
- **SUPERSEDES chips** — hover for the rationale; click through to the
  superseder / victim.
- **`≠opt` marker** — flags when the effective options disagree with
  the reference config, even if the level matches.
- **Drift chip** — appears next to affected rules when
  `.baseline.json` disagrees with the current probe and the plugin
  version actually changed.

### Files

| Path                                 | Role                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `scripts/rule-diff.js`               | Backend + HTTP server                                     |
| `scripts/dashboard.html`             | UI template (`__DATA__` replaced each GET)                |
| `scripts/rule-equivalence.js`        | Unicute → ref rule alias table + prefix renames           |
| `src/rule-supersedes.js`             | Semantic supersedes table (imported at lint time too)     |
| `rule-diff/{category}.json`          | Unicute decisions per category — source of truth, commit  |
| `rule-diff/.baseline.json`           | Drift snapshot, commit                                    |
| `rule-diff/index.html`               | Rendered dashboard — regenerated each run                 |
| `.decide-probe/`                     | Temp probe files (safe to delete, regenerated)            |
| `.claude/hooks/protect-rule-diff.js` | PreToolUse hook — blocks LLM writes to `rule-diff/*.json` |

### Implementation notes

- Each category has its own `{ probe file, unicuteOptions }` scenario
  in `CATEGORIES`. Add an entry when you wire a new plugin in
  `src/configs/`. Scope-only categories (no native plugin, like
  `commonjs`) use `enumerate: () => []` and `packages: []`.
- Drift alerts skip foreign rules — a rule in a non-native category's
  JSON shouldn't surface `new-rule` / `recommended-changed` /
  `rule-retired` noise there; its native category is the single source
  of truth for upstream-state drift.
- `.decide-probe/` is created fresh each run; gitignored.
- The tool never edits `src/configs/*.js` — unicute opinions flow
  through `rule-diff/*.json` (dashboard-authored) and
  `src/rule-supersedes.js` + `CODE_MANAGED_RULES` (code-authored).
- Decisions are only mutated through the HTTP PUT endpoint. A
  PreToolUse hook (`.claude/hooks/protect-rule-diff.js`) blocks Write /
  Edit / MultiEdit / NotebookEdit / destructive Bash on
  `rule-diff/*.json` so LLM assistants can't overwrite saved
  decisions by accident.
