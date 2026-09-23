import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import {
  clearMcpActivitySync,
  recordMcpActivity,
  resolveProjectRoot,
  startMcpSession,
  startSharedMcpSession,
  SESSION_HEARTBEAT_MS,
  type McpSessionHandle,
  type Project,
  type ProjectRoot,
} from '@knightbook/core'
import { registerDocumentTools } from './document-tools.js'
import { instructionsFor } from './instructions.js'
import { parseLaunchMode, type LaunchMode } from './launch-mode.js'
import { registerProjectsTool } from './projects-tool.js'
import { createScope } from './scope.js'
import { registerTools } from './tools.js'

/**
 * The separately launchable MCP process from technical design section 1. The AI
 * client starts it over stdio and keeps it alive for the connection; the desktop
 * window is irrelevant to it, which is what satisfies decision D-008.
 *
 * Logs go to stderr because stdout carries the protocol.
 */

const NAME = 'knightbook'
const VERSION = '0.0.0'

/** Activity is refreshed at most this often per project, so a burst of calls is one write. */
const ACTIVITY_INTERVAL_MS = 5_000

/**
 * Records this process so the desktop window can report an honest connection
 * status. The window has no other way to see us, and we have no way to see it.
 * A root-bound server records itself in its project folder; a shared one beside
 * the access registry, because running does not mean it is working on any one
 * project. Recording is best-effort and never blocks serving.
 */
function trackSession(
  mode: LaunchMode,
  cleanupOnExit: () => void,
): Promise<McpSessionHandle | null> {
  const started =
    mode.kind === 'single'
      ? resolveProjectRoot(mode.root).then(startMcpSession)
      : startSharedMcpSession(mode.registry)

  return started
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
        cleanupOnExit()
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

/**
 * Leaves a "last used" record in each project a shared server actually acts on,
 * which is what lets the window say this project was used rather than implying
 * every enabled project is being worked on.
 */
function activityRecorder(session: Promise<McpSessionHandle | null>) {
  const lastWritten = new Map<string, number>()
  const touched = new Map<string, ProjectRoot>()
  let sessionId: string | null = null
  void session.then((handle) => (sessionId = handle?.sessionId ?? null))

  return {
    onUse(project: Project): void {
      if (sessionId === null) return
      const key = project.root.path
      const now = Date.now()
      if (now - (lastWritten.get(key) ?? 0) < ACTIVITY_INTERVAL_MS) return
      lastWritten.set(key, now)
      touched.set(key, project.root)
      void recordMcpActivity(project.root, sessionId)
    },
    clearSync(): void {
      if (sessionId === null) return
      for (const root of touched.values()) clearMcpActivitySync(root, sessionId)
    },
  }
}

function main(): void {
  let mode: LaunchMode
  try {
    mode = parseLaunchMode(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }

  const serving =
    mode.kind === 'single' ? mode.root : `projects enabled in ${mode.registry} (shared connection)`
  process.stderr.write(`${NAME} ${VERSION} serving ${serving}\n`)

  let clearActivity = (): void => undefined
  const tracked = trackSession(mode, () => clearActivity())
  const activity = activityRecorder(tracked)
  clearActivity = activity.clearSync
  // A root-bound connection's own heartbeat already says it is working on its project.
  const scope = createScope(mode, mode.kind === 'registry' ? activity.onUse : () => undefined)

  serveStdio(() => {
    // The factory runs once a client has opened a connection, which is the only
    // point at which "a client is connected" becomes a fact rather than a guess.
    void tracked.then((session) => session?.markConnected())

    const server = new McpServer(
      { name: NAME, version: VERSION },
      { capabilities: { tools: {} }, instructions: instructionsFor(mode) },
    )
    if (mode.kind === 'registry') registerProjectsTool(server, mode.registry)
    registerTools(server, scope)
    registerDocumentTools(server, scope)
    return server
  })
}

main()
