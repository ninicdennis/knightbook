import type { Result } from './contract.js'

/**
 * What the window is told about MCP: how the client should launch the server,
 * what could be observed about running servers, and the per-project access
 * setting. Part of the renderer contract in contract.ts, which re-exports it.
 */

export interface McpLaunchCommand {
  command: string
  args: string[]
}

/** One MCP server process that recorded itself against this project. */
export interface McpSessionView {
  pid: number
  startedAt: string
  /** When a client completed an opening handshake, or null if none has. */
  connectedAt: string | null
  lastSeenAt: string
}

/**
 * What the app could actually observe about MCP for one checkout. These are
 * separate facts and the UI must not collapse them: the bundled runtime existing
 * says nothing about a server running, a server running says nothing about a
 * client having connected to it, and a shared client being connected says
 * nothing about it working on this project.
 */
export interface McpStatusView {
  /** The checkout this describes, so a reply that arrives late can be discarded. */
  checkoutPath: string
  observedAt: string
  /** Set when nothing could be observed. Not the same as observing nothing. */
  unobservable: string | null
  /** Whether the bundled server the copied configuration points at is present. */
  runtimeAvailable: boolean
  /**
   * Why the runtime could not be put where the configuration points, when the app
   * has to copy it there itself (an AppImage). Null when nothing went wrong.
   */
  runtimeProblem: string | null
  /** Sessions whose heartbeat is current. */
  live: McpSessionView[]
  /** Sessions left behind by a process that stopped without cleaning up. */
  stale: McpSessionView[]
  /** Whether the user has allowed AI access to this checkout through the shared connection. */
  access: McpAccessView
  /**
   * Live servers started with the shared configuration. Their being connected
   * means a client can reach every enabled project, not that it is using this one.
   */
  shared: McpSessionView[]
  /** The last call a live shared server made against this project, or null if none was observed. */
  lastActivityAt: string | null
}

/** The per-checkout "Allow AI access through MCP" setting as stored. */
export interface McpAccessView {
  checkoutPath: string
  enabled: boolean
  /** The id an AI passes to reach this checkout, while it is enabled. */
  checkoutId: string | null
  /** Set when the access list could not be read: nothing is reachable, which is not "off". */
  problem: string | null
}

export interface McpApi {
  /**
   * The one shared configuration for every project the user enables. It names
   * the access list, not a project, so it never changes when projects do.
   */
  mcpLaunchCommand(): Promise<McpLaunchCommand>
  /** Turns "Allow AI access through MCP" on or off for one checkout. */
  setMcpAccess(rootPath: string, enabled: boolean): Promise<Result<McpAccessView>>
  /** Observes MCP status for one checkout. Reads only; it never writes to the project. */
  mcpStatus(rootPath: string): Promise<McpStatusView>
}
