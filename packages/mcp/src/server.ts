import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import {
  resolveProjectRoot,
  startMcpSession,
  SESSION_HEARTBEAT_MS,
  type McpSessionHandle,
} from '@projectspace/core'
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

/**
 * Records this process in the project folder so the desktop window can report an
 * honest connection status. The window has no other way to see us, and we have
 * no way to see it. Recording is best-effort and never blocks serving.
 */
function trackSession(root: string): Promise<McpSessionHandle | null> {
  return resolveProjectRoot(root)
    .then(startMcpSession)
    .then((session) => {
      const timer = setInterval(() => void session.beat(), SESSION_HEARTBEAT_MS)
      // The heartbeat must not be the reason the process outlives its client.
      timer.unref()

      // Cleanup has to be synchronous here: by the time `exit` runs the event
      // loop is closed, so an awaited removal would never happen and every
      // shutdown would leave a record behind for the next server to sweep.
      process.once('exit', () => {
        clearInterval(timer)
        session.endSync()
      })

      /**
       * The stdio binding ends a connection by closing the server's input, so
       * this is the shutdown that actually happens in normal use. Signals are
       * the secondary path, and a hard kill is caught by neither — that is what
       * the stale heartbeat and the startup sweep are for.
       */
      process.stdin.once('close', () => process.exit(0))
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.once(signal, () => process.exit(0))
      }
      return session
    })
    .catch(() => null)
}

function main(): void {
  let root: string
  try {
    root = parseRootArgument(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }

  process.stderr.write(`${NAME} ${VERSION} serving ${root}\n`)
  const tracked = trackSession(root)

  serveStdio(() => {
    // The factory runs once a client has opened a connection, which is the only
    // point at which "a client is connected" becomes a fact rather than a guess.
    void tracked.then((session) => session?.markConnected())

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
