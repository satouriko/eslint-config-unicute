# unicute

> 🌸 **Unified and cute.** 代码的整齐统一，严格得恰到好处。

[English](./README.md) · [逐条浏览所有决策 →](https://satouriko.github.io/eslint-config-unicute/)

TypeScript-first 的 ESLint flat config。零配置，按项目自动组装。

---

## 安装

```bash
pnpm add -D eslint prettier eslint-config-unicute
```

```js
// eslint.config.js
import unicute from 'eslint-config-unicute'
export default unicute()
```

Peer deps：`eslint ≥ 9.35`、`typescript ≥ 4.8.4`、`prettier ≥ 3.5`、`node ≥ 18.18`（eslint 9 和 10 的 engines 并集）。

> **格式化请走 ESLint，不要单独跑 Prettier。** unicute 管理 Prettier 配置，通过 `eslint-plugin-prettier` 在 ESLint 内部调用 Prettier——`eslint --fix` 一条命令就会把整个项目格式化。单独跑 `prettier --write` 是多余的，还会跟 unicute 的设置冲突（它会读 `.prettierrc`，而 unicute 是忽略 `.prettierrc` 的）。

---

## 开箱即用

**按项目自动组装。** unicute 探测已装的依赖，按需启用对应规则链——一次调用即可。

---

## 规则取舍

**开**一条规则的理由：

- **最佳实践**——发现 bug、反模式、类型错误。
- **风格一致性**——同一件事只保留一种写法，与 Prettier 同一个理念。Prettier 管 formatting，ESLint 管 non-formatting 层面的写法一致性（如 TypeScript 里 `public` 关键字的取舍、`interface` 与 `type` 的分工、type imports 的书写风格等）。

**关**一条规则的理由：

- **正确性保护**——规则的 autofix 可能引入非预期的运行时语义差异。`prefer-*` 类规则大多属于这一档。
- **语法自由度**——对明显无害的语法差异不加强制（典型的反例是 airbnb 的 `no-plusplus`）。

---

## 和其他配置对比

unicute 的规则取舍、选项、例外清单等大量借鉴了以下四套配置：

- [**eslint-config-airbnb-extended**](https://github.com/airbnb/eslint-config-airbnb) —— 核心 ESLint 规则的选项、例外清单、命名约定等多年打磨的细节（例如 `no-param-reassign` 对 `acc` / `accumulator` / `e` / `ctx` / `req` 等形参的例外清单）。
- [**neostandard**](https://github.com/neostandard/neostandard)（standard 的 flat-config 继承者）—— 核心代码风格取向（no-semi、single-quote 等 Standard 传统），以及一些核心 ESLint 规则的判断。unicute 保留 trailing comma，因为它在 diff 上更友好。
- [**antfu/eslint-config**](https://github.com/antfu/eslint-config) —— flat-config 原生设计、按项目自动探测、工厂函数 API 等工程模式；现代插件链（unicorn、import-x、regexp 等）的选型思路和部分规则取舍。
- [**@sxzz/eslint-config**](https://github.com/sxzz/eslint-config) —— Prettier 作为 formatting 层的整体路线；Prettier 默认配置（no-semi、single-quote、trailingComma 'all'）；插件链选型和 unicorn 等规则的具体取舍。

每条规则的实际状态、options 以及跟这四套配置的实时 side-by-side diff 都可以在 **[satouriko.github.io/eslint-config-unicute](https://satouriko.github.io/eslint-config-unicute/)** 上逐条查看——每次推到 `main` 都会重新构建。

### vs airbnb-extended

同——都属于"开箱即用、规则面广"的 opinionated 派，核心 ESLint 规则覆盖很全；**代码风格部分重合**（都是 single-quote + 多行 trailing comma）。

异：

- **分号**：airbnb 用 semi-always；unicute 不加分号。
- **TypeScript**：airbnb 几乎不用 type-aware 规则；unicute 用 strict + type-aware 全套。
- **React 插件**：airbnb 用传统 `eslint-plugin-react`（70+ 条规则覆盖 prop-types、class component 等历史用法）；unicute 用现代 `@eslint-react`（面向 hooks 时代）。
- **Formatting 归属**：airbnb 通过 `@stylistic/*`；unicute 交给 Prettier。
- **对明显无害语法的限制**：airbnb 禁止 `no-plusplus`、`no-bitwise`、`no-continue`、`no-await-in-loop`、`no-lonely-if`、`consistent-return` 等；unicute 不禁止这些（见上面的"语法自由度"条目）。

### vs neostandard

同——flat-config only，self-contained；**核心代码风格取向接近**（no-semi、single-quote 等 Standard 传统）。

异：

- **覆盖面**：neostandard 刻意只管核心 JS 风格；unicute 覆盖 TS type-aware、现代框架、测试、文档、多类配置文件。
- **Formatting 归属**：neostandard 通过 `@stylistic/*` 自己做；unicute 交给 Prettier。
- **Trailing comma**：unicute 用 `trailingComma: 'all'`；Standard 传统是 no-trailing-comma（neostandard 当前不强制）。

### vs antfu

同——flat-config only，按项目自动探测框架，核心插件选型（typescript-eslint、unicorn、vue 等）重合度高；**核心代码风格同路**（no-semi、single-quote、多行 trailing comma）。

异：

- **TypeScript 严格度**：antfu 使用 typescript-eslint 的 `recommended` 预设（不含 type-aware）；unicute 使用 `strictTypeChecked + stylisticTypeChecked`，type-aware 全量打开。
- **Formatting 归属**：antfu 通过 `@stylistic/*` 自己做 formatting；unicute 整块交给 Prettier。
- **Import 解析与分组**：unicute 的 import 解析是 type-aware 的——通过 `eslint-import-resolver-typescript` 读 tsconfig 的 paths / alias（monorepo 下递归查找 tsconfig），`import-x/order` 按解析出的路径做分组；antfu 的 import 解析路线不同。
- **antfu 默认带的额外插件 unicute 没有**：`antfu/*`（antfu 自有规则）、`e18e`（生态迁移提醒）、`command`（注释命令）等。

### vs sxzz

同——flat-config only，按项目自动探测框架，**都用 Prettier 做 formatting**，核心代码风格完全一致（no-semi、single-quote、trailing comma 'all'），核心插件选型有大量重合。

异：

- **TypeScript 严格度**：sxzz 使用更宽松的 typescript-eslint 预设；unicute 使用 `strictTypeChecked + stylisticTypeChecked`，type-aware 全量打开。
- **unicorn `prefer-*` / `no-useless-*` 等建议换 API 的规则**：sxzz 几乎一股脑儿全开；unicute 逐条权衡每条 autofix 的语义差异风险 —— 真正安全的（`prefer-math-min-max`、`prefer-set-has`、`prefer-node-protocol` 等）保留开启，运行时行为有细微差别的（`prefer-at`、`prefer-includes`、`prefer-string-replace-all`、`prefer-number-properties`、`prefer-spread`……）关掉。
- **Import 解析与分组**：unicute 的 import 解析是 type-aware 的——通过 `eslint-import-resolver-typescript` 读 tsconfig 的 paths / alias（monorepo 下递归查找 tsconfig）做分组；sxzz 的 import 解析路线不同。
- **sxzz 默认带的额外插件 unicute 没有**：`de-morgan`（德摩根律改写）、`baseline-js`（Web 平台 Baseline 检查）、`command`、以及 `sxzz/*` 自有规则。

---

## API

```ts
unicute(firstArg?, ...userConfigs)
```

所有选项默认按已装的依赖自动探测；显式传入可覆盖探测结果或传入 options。

| 选项          | 默认     | 说明                                                                  |
| ------------- | -------- | --------------------------------------------------------------------- |
| `typescript`  | 自动探测 | strict + type-aware + `projectService: true`；传 `{ tsconfigRootDir }` 可锁定 project 根 |
| `react`       | 自动探测 | `true \| { files?, a11y? }`                                           |
| `vue`         | 自动探测 | `true \| { files?, sfcTsx?, a11y? }`                                  |
| `svelte`      | 自动探测 | `true \| { a11y? }`                                                   |
| `tailwindcss` | 自动探测 |                                                                       |
| `vitest`      | 自动探测 |                                                                       |
| `node`        | `false`  | 需显式 opt-in——`true \| glob \| glob[]`                               |
| `jsdoc`       | `false`  | 需显式 opt-in——recommended 规则对每个 `/** */` 都触发，未必都是 JSDoc |
| `pnpm`        | 自动探测 | 存在 `pnpm-workspace.yaml` 时启用                                     |
| `prettier`    | `true`   | `boolean \| PrettierOptions`                                          |
| `gitignore`   | `true`   | 读取 `.gitignore` 进忽略列表                                          |

`firstArg` 里也可以混入 flat-config key——未识别的键会构成一个用户 config block（antfu 风格）：

```js
export default unicute({
  react: { a11y: true },
  files: ['scripts/**'],
  rules: { 'no-console': 'off' },
})
```

后续参数作为额外 config block 追加在链尾，按 flat-config 的 later-wins 顺序覆盖 unicute 的默认。

`.cjs` / `.cts` 文件自动按 CommonJS 处理——注入 `sourceType: 'commonjs'` 与 CommonJS 全局变量，`require`、`module`、`__dirname` 等不会触发 `no-undef`。

### `globals` 再导出

为方便声明全局变量，unicute 再导出 [`globals`](https://www.npmjs.com/package/globals) 包：

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
