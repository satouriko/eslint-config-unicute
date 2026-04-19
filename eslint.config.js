import unicute from 'eslint-config-unicute'

export default unicute(
  { node: true },
  { ignores: ['rule-diff/**'] },
  {
    // Claude Code hooks have shebangs so the runtime can exec them directly;
    // they aren't published `bin` entries in package.json. Suppress n/hashbang
    // here rather than inline-comment-per-file.
    files: ['.claude/hooks/*.js'],
    rules: { 'n/hashbang': 'off' },
  },
)
