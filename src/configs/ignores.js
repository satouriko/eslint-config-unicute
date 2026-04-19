import gitignore from 'eslint-config-flat-gitignore'

const COMMON_IGNORES = [
  '**/node_modules',
  '**/dist',
  '**/build',
  '**/coverage',
  '**/.next',
  '**/.nuxt',
  '**/.output',
  '**/.vitepress/cache',
  '**/.nitro',
  '**/.cache',
  '**/.turbo',
  '**/*.min.*',
  '**/CHANGELOG*.md',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/package-lock.json',
  '**/.decide-probe',
  'rule-diff/index.html',
]

/**
 *
 * @param root0
 * @param root0.useGitignore
 */
export function ignores({ useGitignore = true } = {}) {
  return [
    useGitignore ? gitignore({ strict: false }) : null,
    { ignores: COMMON_IGNORES, name: 'unicute/ignores' },
  ].filter(Boolean)
}
