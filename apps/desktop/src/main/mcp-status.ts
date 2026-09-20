import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { readMcpSessions, resolveProjectRoot, type McpSessionRecord } from '@projectspace/core'
import { mcpResourcesDir, NODE_BINARY } from './mcp-resources.js'
import type { McpSessionView, McpStatusView } from '../shared/contract.js'

/**
 * Observes MCP for one checkout, and reports only what it could actually see.
 *
 * Three different facts are kept apart on purpose. The bundled runtime being
 * present says the copied configuration points at something real; it says
 * nothing about a server running. A recorded session says a server process
 * started; it says nothing about a client having connected. Collapsing any of
 * these into one green light would claim a working connection the app has no
 * evidence for.
 *
 * This reads and never writes. Looking at status must not modify the user's
 * project, so abandoned records are cleaned up by a starting server instead.
 */

/** The server cannot run without both of these, so both have to be there. */
async function runtimeIsPresent(): Promise<boolean> {
  const dir = mcpResourcesDir()
  try {
    await access(join(dir, NODE_BINARY))
    await access(join(dir, 'server.mjs'))
    return true
  } catch {
    return false
  }
}

function toView(record: McpSessionRecord): McpSessionView {
  return {
    pid: record.pid,
    startedAt: record.startedAt,
    connectedAt: record.connectedAt,
    lastSeenAt: record.lastSeenAt,
  }
}

export async function readMcpStatus(rootPath: string): Promise<McpStatusView> {
  const observedAt = new Date().toISOString()
  const runtimeAvailable = await runtimeIsPresent()

  try {
    const root = await resolveProjectRoot(rootPath)
    const sessions = await readMcpSessions(root)
    return {
      checkoutPath: rootPath,
      observedAt,
      unobservable: sessions.unreadable,
      runtimeAvailable,
      live: sessions.live.map(toView),
      stale: sessions.stale.map(toView),
    }
  } catch (error) {
    // The runtime answer is still good; only the session side is unknown.
    return {
      checkoutPath: rootPath,
      observedAt,
      unobservable: error instanceof Error ? error.message : String(error),
      runtimeAvailable,
      live: [],
      stale: [],
    }
  }
}
