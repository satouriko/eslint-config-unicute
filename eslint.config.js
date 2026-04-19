import unicute from 'eslint-config-unicute'

export default unicute(
  // `pnpm: false` — we created pnpm-workspace.yaml purely to make the
  // smoke-test fixture-project a workspace sibling, so its fixture deps
  // (tailwindcss, vitest) don't leak into our own package.json. Our own
  // package.json isn't subject to the pnpm plugin's catalog-ref rules.
  { node: true, pnpm: false },
  { ignores: ['rule-diff/**', 'tests/fixture-project/**'] },
  {
    // Claude Code hooks have shebangs so the runtime can exec them directly;
    // they aren't published `bin` entries in package.json. Suppress n/hashbang
    // here rather than inline-comment-per-file.
    files: ['.claude/hooks/*.js'],
    rules: { 'n/hashbang': 'off' },
  },
)
