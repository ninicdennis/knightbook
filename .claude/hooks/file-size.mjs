// PostToolUse hook: tells the agent when a source file it just edited or wrote has
// passed the size limits in AGENTS.md (ideally under 300 lines, never 400).
//
// Past 300 it adds a note to the agent's context. Past 400 it returns a "block"
// decision, which Claude Code shows the agent as something to act on; the edit
// itself has already happened and is not undone.
//
// Only code is counted. Prose (the specification runs to hundreds of lines by
// design), lockfiles and generated output are not held to the limit.

import { existsSync, readFileSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'

const SOFT_LIMIT = 300
const HARD_LIMIT = 400
const CODE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.css'])
const GENERATED = /(^|[\\/])(node_modules|dist|out|release|coverage)[\\/]/

const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path
if (!filePath || !CODE.has(extname(filePath))) process.exit(0)

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd
const target = isAbsolute(filePath) ? filePath : resolve(input.cwd, filePath)
const shown = relative(projectDir, target)
if (GENERATED.test(shown) || !existsSync(target)) process.exit(0)

const text = readFileSync(target, 'utf8')
// A trailing newline ends the last line rather than starting another.
const lines = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

if (lines >= HARD_LIMIT) {
  const reason =
    `${shown} is now ${lines} lines, at or over the ${HARD_LIMIT}-line hard limit in AGENTS.md. ` +
    'Split it before adding more, or say in the handoff why it cannot be split yet.'
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
} else if (lines > SOFT_LIMIT) {
  const additionalContext =
    `${shown} is now ${lines} lines, past the ${SOFT_LIMIT} AGENTS.md aims for ` +
    `(hard limit ${HARD_LIMIT}). Consider splitting it before it grows further.`
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }),
  )
}
