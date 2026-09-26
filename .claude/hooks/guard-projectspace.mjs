// PreToolUse hook: refuses agent Edit and Write calls under `.projectspace/`.
//
// The app and the MCP server write those files byte for byte under a shared lock
// and a revision check (AGENTS.md). A hand edit skips both. MCP tool calls are not
// Edit or Write calls, so board changes made through the knightbook tools pass.
//
// Exit code 2 is Claude Code's "block this call"; stderr becomes the reason it sees.

import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path
if (!filePath) process.exit(0)

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd
const target = isAbsolute(filePath) ? filePath : resolve(input.cwd, filePath)
const [firstSegment = ''] = relative(projectDir, target).split(sep)
// Windows and macOS file systems ignore case by default, so `.ProjectSpace` there
// is the same folder. Linux keeps them apart.
const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin'
const segment = caseInsensitive ? firstSegment.toLowerCase() : firstSegment

if (segment === '.projectspace') {
  process.stderr.write(
    `Blocked: ${filePath} is inside .projectspace/, which is never edited by hand. ` +
      'Make board changes through the knightbook MCP tools (ticket_update, ' +
      'ticket_create and the rest); they take the write lock and check the revision.\n',
  )
  process.exit(2)
}
