import { GLOB_CJS } from '../utils.js'

import { overridesBlock } from './_overrides.js'

/**
 * Scope-only category for `.cjs` / `.cts` overrides.
 *
 * No native plugin — this category exists purely so users can put
 * rule-level decisions (from any plugin) in `rule-diff/commonjs.json`
 * and have them apply only to CommonJS files. Typical use: enabling /
 * disabling an ESM-biased rule differently under CJS (e.g.
 * `import-x/no-useless-path-segments` with `noUselessIndex: false`
 * so CJS's implicit `index.js` resolution isn't flagged).
 *
 * The language-options side (`sourceType: 'commonjs'`, CommonJS globals)
 * already lives in `javascript.js` — this file only emits the overrides
 * block so it can layer on top of every other config.
 */
export function commonjsConfig() {
  return overridesBlock('commonjs', GLOB_CJS)
}
