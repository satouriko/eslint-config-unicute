import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

const ROOT = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(ROOT, '.codex/hooks.json'), 'utf8'))
const { command } = config.hooks.PreToolUse[0].hooks[0]

describe('Codex rule-diff hook', () => {
  for (const cwd of [ROOT, resolve(ROOT, 'src/configs')]) {
    for (const patch of [
      '*** Add File: rule-diff/example.json\n+{}',
      '*** Update File: rule-diff/example.json\n@@\n-{}\n+{"x": 1}',
      '*** Delete File: rule-diff/example.json',
      '*** Update File: src/example.json\n*** Move to: rule-diff/example.json\n@@\n-{}\n+{}',
      `*** Update File: ${ROOT}/rule-diff/example.json\n@@\n-{}\n+{}`,
    ]) {
      it(`blocks ${patch.split('\n')[0]} from ${cwd}`, () => {
        const result = spawnSync(command, {
          cwd,
          shell: true,
          encoding: 'utf8',
          input: JSON.stringify({
            tool_name: 'apply_patch',
            tool_input: { command: `*** Begin Patch\n${patch}\n*** End Patch` },
          }),
        })
        assert.equal(result.status, 2, result.stderr)
        assert.match(result.stderr, /Refusing/)
      })
    }

    it(`allows source patches from ${cwd}`, () => {
      const result = spawnSync(command, {
        cwd,
        shell: true,
        encoding: 'utf8',
        input: JSON.stringify({
          tool_name: 'apply_patch',
          tool_input: {
            command: '*** Begin Patch\n*** Add File: src/example.js\n+// rule-diff/example.json\n*** End Patch',
          },
        }),
      })
      assert.equal(result.status, 0, result.stderr)
    })
  }
})
