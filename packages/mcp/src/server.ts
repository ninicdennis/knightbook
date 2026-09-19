import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { parseRootArgument } from './root.js'
import { registerDocumentTools } from './document-tools.js'
import { SERVER_INSTRUCTIONS } from './instructions.js'
import { registerTools } from './tools.js'

/**
 * The separately launchable MCP process from technical design section 1. The AI
 * client starts it over stdio and keeps it alive for the connection; the desktop
 * window is irrelevant to it, which is what satisfies decision D-008.
 *
 * Logs go to stderr because stdout carries the protocol.
 */

const NAME = 'projectspace'
const VERSION = '0.0.0'

function main(): void {
  let root: string
  try {
    root = parseRootArgument(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }

  process.stderr.write(`${NAME} ${VERSION} serving ${root}\n`)

  serveStdio(() => {
    const server = new McpServer(
      { name: NAME, version: VERSION },
      { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
    )
    registerTools(server, root)
    registerDocumentTools(server, root)
    return server
  })
}

main()
