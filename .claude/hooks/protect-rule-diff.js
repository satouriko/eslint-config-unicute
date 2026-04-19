#!/usr/bin/env node
// PreToolUse hook: blocks Claude Code from mutating rule-diff/*.json.
//
// rule-diff/ is the user's hand-curated unicute-decision data. It is written
// by scripts/rule-diff.js over HTTP (the dashboard's PUT handler) — NEVER by
// tool calls. A careless test "restore step" once clobbered 18 real decisions
// by writing stale fixtures over the real files. This hook is the guard so
// that can't happen again.
//
// Blocks:
//   Write / Edit / MultiEdit / NotebookEdit     targeting rule-diff/*.json
//   Bash: redirect / mv / cp / rm / sed -i / tee / ln / install / truncate
//         with a target path matching rule-diff/*.json
//   Bash: rm -r / rmdir / mv on the rule-diff directory itself
//
// Allows:
//   Reading (cat / head / grep / diff / tail / wc / jq ...)
//   Any tool that doesn't touch rule-diff
//
// If you ever genuinely need to bypass this, edit `.claude/settings.json` or
// add a `.claude/settings.local.json` override. The friction is deliberate.

import { Buffer } from 'node:buffer'
import process from 'node:process'

const chunks = []
for await (const c of process.stdin) chunks.push(c)
const raw = Buffer.concat(chunks).toString('utf8')

let payload
try {
  payload = JSON.parse(raw || '{}')
} catch {
  // If we can't parse the event, don't block — hooks shouldn't break
  // unrelated tool calls because of malformed input.
  process.exit(0)
}

const block = (reason) => {
  process.stderr.write(`⛔ ${reason}\n`)
  process.exit(2)
}

const tool = payload.tool_name
const input = payload.tool_input ?? {}

// Files-in-rule-diff/<name>.json test. Absolute or relative paths; catches
// both `rule-diff/foo.json` and `/abs/path/rule-diff/foo.json`.
const RULE_DIFF_JSON = /(?:^|\/)rule-diff\/[^/]+\.json$/

if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const path = input.file_path ?? input.notebook_path ?? ''
  if (RULE_DIFF_JSON.test(path)) {
    block(
      `Refusing to write ${path}. rule-diff/*.json is user-curated decision data managed by the scripts/rule-diff.js dashboard (HTTP PUT), not by tool calls. Use /tmp for test fixtures.`,
    )
  }
}

if (tool === 'Bash') {
  const cmd = input.command ?? ''

  // Any shell construct that writes to a rule-diff/*.json file. Intentionally
  // broad: if a rule-diff/<anything>.json path appears as the target/object of
  // a mutating verb inside the same statement, we block. Reads (cat, head,
  // diff, grep, jq, wc, tail, less, file, ls) don't match.
  //
  // `[^|;&\n]*` intentionally excludes the common statement separators AND
  // newlines — otherwise the regex would greedily span across statements and
  // flag a benign later `ls rule-diff/*.json` after an earlier unrelated
  // `rm foo` on the previous line.
  const WRITE_TO_JSON =
    /(?:>|\btee\b|\bmv\b|\bcp\b|\brm\b|\bunlink\b|\btruncate\b|\binstall\b|\bln\b|\bsed\s+-i)[^|;&\n]*(?:\/|\s)rule-diff\/[^\s|;&]+\.json/

  // Directory-level nukes against rule-diff/ itself (same single-statement
  // scope as above).
  const NUKE_DIR =
    /(?:\brm\s+(?:[^\s&;|][^|;&\n]*)?-[rRf]|\brmdir\b|\bmv\b)[^|;&\n]*(?:\/|\s)rule-diff\/?(?:\s|$|[|;&])/

  if (WRITE_TO_JSON.test(cmd)) {
    block(
      `Refusing bash command that would mutate a rule-diff/*.json file. Use /tmp for test fixtures.\ncommand: ${cmd}`,
    )
  }
  if (NUKE_DIR.test(cmd)) {
    block(
      `Refusing rm/rmdir/mv on the rule-diff/ directory. That directory holds user-curated decision data.\ncommand: ${cmd}`,
    )
  }
}

// Allow.
process.exit(0)
