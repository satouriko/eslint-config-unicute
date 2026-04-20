import { describe, expect, it } from 'vitest'

// `describe.only` → `no-only-tests/no-only-tests`
describe.only('sample', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
