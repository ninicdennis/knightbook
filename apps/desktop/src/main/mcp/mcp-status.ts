import { access } from 'node:fs/promises'
import { join } from 'node:path'
import {
  findEnabledCheckout,
  readMcpActivity,
  readMcpSessions,
  readSharedMcpSessions,
  resolveProjectRoot,
  type McpSessionRecord,
} from '@knightbook/core'
import { mcpRuntimeDir, NODE_BINARY } from './mcp-resources.js'
import { appImageRuntimeProblem } from './appimage-runtime.js'
import type { McpAccessView, McpSessionView, McpStatusView } from '../../shared/contract.js'

/**
 * Observes MCP for one checkout, and reports only what it could actually see.
 *
 * Several different facts are kept apart on purpose. The bundled runtime being
 * present says the copied configuration points at something real; it says
 * nothing about a server running. A recorded session says a server process
 * started; it says nothing about a client having connected. A shared connection
 * being open says an AI can reach every enabled project, not that it is working
 * on this one — that is what the separate activity record is for. Collapsing any
 * of these into one green light would claim more than the app has evidence for.
 *
 * This reads and never writes. Looking at status must not modify the user's
 * project, so abandoned records are cleaned up by a starting server instead.
 */

/** The server cannot run without both of these, so both have to be there. */
async function runtimeIsPresent(): Promise<boolean> {
  const dir = mcpRuntimeDir()
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

export async function readMcpAccess(
  registryPath: string,
  checkoutPath: string,
): Promise<McpAccessView> {
  try {
    const entry = await findEnabledCheckout(registryPath, checkoutPath)
    return {
      checkoutPath,
      enabled: entry !== null,
      checkoutId: entry?.checkout_id ?? null,
      problem: null,
    }
  } catch (error) {
    // An unreadable list grants nothing; say so rather than showing "off".
    return {
      checkoutPath,
      enabled: false,
      checkoutId: null,
      problem: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * The shared server's heartbeat and this project's activity record, joined:
 * activity only counts while the session that left it is still alive, so a call
 * made by a client that has since gone is not reported as current use.
 */
async function readSharedObservation(registryPath: string, rootPath: string) {
  const sessions = await readSharedMcpSessions(registryPath)
  const liveIds = new Set(sessions.live.map((session) => session.sessionId))
  let lastActivityAt: string | null = null
  try {
    const activity = await readMcpActivity(await resolveProjectRoot(rootPath))
    for (const record of activity) {
      if (!liveIds.has(record.sessionId)) continue
      if (lastActivityAt === null || record.lastActivityAt > lastActivityAt) {
        lastActivityAt = record.lastActivityAt
      }
    }
  } catch {
    // No activity readable is no activity observed, which is what gets said.
  }
  return { shared: sessions.live.map(toView), lastActivityAt }
}

export async function readMcpStatus(
  rootPath: string,
  registryPath: string,
): Promise<McpStatusView> {
  const observedAt = new Date().toISOString()
  // The copy is checked first: while it is still running, the files are not
  // there yet, and that is not the same as their being missing.
  const runtimeProblem = await appImageRuntimeProblem()
  const runtimeAvailable = await runtimeIsPresent()
  const access = await readMcpAccess(registryPath, rootPath)
  const { shared, lastActivityAt } = await readSharedObservation(registryPath, rootPath)
  const common = {
    checkoutPath: rootPath,
    observedAt,
    runtimeAvailable,
    runtimeProblem,
    access,
    shared,
  }

  try {
    const root = await resolveProjectRoot(rootPath)
    const sessions = await readMcpSessions(root)
    return {
      ...common,
      unobservable: sessions.unreadable,
      live: sessions.live.map(toView),
      stale: sessions.stale.map(toView),
      lastActivityAt,
    }
  } catch (error) {
    // The runtime answer is still good; only the session side is unknown.
    return {
      ...common,
      unobservable: error instanceof Error ? error.message : String(error),
      live: [],
      stale: [],
      lastActivityAt: null,
    }
  }
}
