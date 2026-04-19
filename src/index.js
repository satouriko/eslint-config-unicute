/**
 * eslint-config-unicute — opinionated TS-first flat ESLint config.
 *
 *   import unicute from 'eslint-config-unicute'
 *   export default unicute({ react: true })
 *
 * The first argument may mix unicute options with a flat-config block
 * (antfu-style) — unknown keys become a user config layer applied before any
 * extra arguments.
 */

import { defineConfig } from 'eslint/config'

import { commentsConfig } from './configs/comments.js'
import { commonjsConfig } from './configs/commonjs.js'
import { ignores } from './configs/ignores.js'
import { imports } from './configs/imports.js'
import { javascript } from './configs/javascript.js'
import { jsdocConfig } from './configs/jsdoc.js'
import { jsoncConfig } from './configs/jsonc.js'
import { jsxConfig } from './configs/jsx.js'
import { nodeConfig } from './configs/node.js'
import { perfectionistConfig } from './configs/perfectionist.js'
import { pnpmConfig } from './configs/pnpm.js'
import { prettierConfig } from './configs/prettier.js'
import { reactConfig } from './configs/react.js'
import { regexpConfig } from './configs/regexp.js'
import { svelteConfig } from './configs/svelte.js'
import { tailwindConfig } from './configs/tailwind.js'
import { testingConfig } from './configs/testing.js'
import { tomlConfig } from './configs/toml.js'
import { typescriptConfig } from './configs/typescript.js'
import { unicornConfig } from './configs/unicorn.js'
import { vueConfig } from './configs/vue.js'
import { yamlConfig } from './configs/yaml.js'
import { hasPnpmWorkspace, isPackageExists } from './utils.js'

/** Re-export of the `globals` package for consumer `languageOptions.globals`. */
export { default as globals } from 'globals'

const OPTION_KEYS = new Set([
  'gitignore',
  'jsdoc',
  'node',
  'pnpm',
  'prettier',
  'react',
  'svelte',
  'tailwindcss',
  'typescript',
  'vitest',
  'vue',
])

/**
 * Splits the first argument into (unicute options) and (an extra flat-config block
 * made from the leftover keys, antfu-style).
 *
 * Safety: `files` in the first argument is rejected. Rationale — unicute options
 * are **global**; reading a `files` key at the top level is almost always a mistake
 * (users expect it to scope the whole config, but it would only scope the leftover
 * rules/plugins/etc. block). A clear error beats silent misbehavior. Put `files`
 * in a separate config passed as a later argument instead. (Same check antfu runs.)
 * @param firstArgument
 */
function extractOptions(firstArgument) {
  if (!firstArgument || typeof firstArgument !== 'object') return { block: null, options: {} }
  if ('files' in firstArgument) {
    throw new Error(
      '[eslint-config-unicute] The first argument must not contain a "files" property. '
        + 'unicute options apply globally; put `files` in a separate config block passed as a later argument.',
    )
  }
  const options = {}
  const block = {}
  for (const [key, value] of Object.entries(firstArgument)) {
    if (OPTION_KEYS.has(key)) options[key] = value
    else block[key] = value
  }
  return {
    block: Object.keys(block).length > 0 ? block : null,
    options,
  }
}

/**
 * @param {import('./index.d.ts').UnicuteFirstArg} [firstArg]
 * @param firstArgument
 * @param {...import('eslint').Linter.Config} userConfigs
 */
export function unicute(firstArgument = {}, ...userConfigs) {
  const { block, options } = extractOptions(firstArgument)
  const {
    gitignore = true,
    // `jsdoc` is opt-in. Rationale: eslint-plugin-jsdoc's recommended set fires
    // on every `/** */` block (alignment, multi-asterisks, tag-names …), but
    // `/** */` isn't always *intended* as JSDoc — plenty of codebases use it as
    // a plain multi-line comment or section marker. False positives on that
    // style are costly and noisy. Opt in when the project actually commits to
    // JSDoc as a documentation layer.
    jsdoc = false,
    node = false,
    pnpm = hasPnpmWorkspace(),
    prettier = true,
    react = isPackageExists('react'),
    svelte = isPackageExists('svelte'),
    tailwindcss = isPackageExists('tailwindcss'),
    typescript = isPackageExists('typescript'),
    vitest = isPackageExists('vitest'),
    vue = isPackageExists('vue'),
  } = options

  const reactOptions = react === true ? {} : react && typeof react === 'object' ? react : null
  const vueOptions = vue === true ? {} : vue && typeof vue === 'object' ? vue : null
  const svelteOptions = svelte === true ? {} : svelte && typeof svelte === 'object' ? svelte : null
  // `node` is opt-in and accepts three shapes (see UnicuteOptions):
  //   true          → apply to all JS/TS source (nodeConfig's DEFAULT_FILES)
  //   string | []   → apply to just those globs (e.g. 'server/**')
  //   false / unset → do not load eslint-plugin-n at all
  const nodeOptions =
    node === true ? {} : typeof node === 'string' ? { files: [node] } : Array.isArray(node) ? { files: node } : null

  const prettierUserOptions = prettier === true ? {} : prettier && typeof prettier === 'object' ? prettier : null

  const allUserConfigs = block ? [block, ...userConfigs] : userConfigs

  return defineConfig([
    ...ignores({ useGitignore: gitignore }),

    ...javascript(),
    ...jsxConfig(),
    ...unicornConfig(),
    ...regexpConfig(),
    ...imports({ typescript }),
    ...perfectionistConfig(),
    ...commentsConfig(),
    ...(jsdoc ? jsdocConfig() : []),
    ...testingConfig({ vitest }),

    ...(typescript ? typescriptConfig() : []),

    ...(reactOptions ? reactConfig(reactOptions) : []),
    ...(vueOptions ? vueConfig(vueOptions) : []),
    ...(svelteOptions ? svelteConfig(svelteOptions) : []),
    ...(nodeOptions ? nodeConfig(nodeOptions) : []),
    ...(tailwindcss ? tailwindConfig() : []),

    ...jsoncConfig(),
    ...yamlConfig(),
    ...tomlConfig(),
    ...(pnpm ? pnpmConfig() : []),

    // Scope-only override category for `.cjs` / `.cts`. Loaded after the
    // main chains so it wins over defaults; applies before user configs.
    ...commonjsConfig(),

    ...allUserConfigs,

    ...(prettierUserOptions ? prettierConfig(prettierUserOptions, { svelte: svelteOptions !== null }) : []),
  ])
}

export default unicute
