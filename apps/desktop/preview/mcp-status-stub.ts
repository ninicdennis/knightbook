import type { McpStatusView } from '../src/shared/contract.js'

/** Whether this preview's project is allowed; the panel's switch changes it for the session. */
let stubAllowed = true

export function setStubAllowed(enabled: boolean): void {
  stubAllowed = enabled
}

/**
 * The footer has several states and only one of them is reachable by luck, so
 * the preview picks between them from the URL the same way `?problems` does.
 */
export function stubMcpStatus(root: string): McpStatusView {
  const want = new URLSearchParams(window.location.search).get('mcp') ?? 'connected'
  const now = Date.now()
  const at = (msAgo: number) => new Date(now - msAgo).toISOString()
  const access = { checkoutPath: root, enabled: stubAllowed, checkoutId: 'c-1', problem: null }
  const base: McpStatusView = {
    checkoutPath: root,
    observedAt: at(0),
    unobservable: null,
    runtimeAvailable: true,
    live: [],
    stale: [],
    access,
    shared: [],
    lastActivityAt: null,
  }
  const sharedClient = {
    pid: 9100,
    startedAt: at(900_000),
    connectedAt: at(880_000),
    lastSeenAt: at(2_000),
  }

  if (want === 'none') return base
  if (want === 'shared') return { ...base, shared: [sharedClient], lastActivityAt: at(120_000) }
  if (want === 'shared-idle') return { ...base, shared: [sharedClient] }
  if (want === 'access-broken') {
    return {
      ...base,
      shared: [sharedClient],
      access: { ...access, enabled: false, problem: 'Unexpected end of JSON input' },
    }
  }
  if (want === 'missing') return { ...base, runtimeAvailable: false }
  if (want === 'unknown') return { ...base, unobservable: 'EPERM: permission denied' }
  if (want === 'stale') {
    const startedAt = at(3_600_000)
    return {
      ...base,
      stale: [{ pid: 8120, startedAt, connectedAt: startedAt, lastSeenAt: at(600_000) }],
    }
  }
  if (want === 'running') {
    return {
      ...base,
      live: [{ pid: 8120, startedAt: at(4_000), connectedAt: null, lastSeenAt: at(1_000) }],
    }
  }
  return {
    ...base,
    live: [{ pid: 8120, startedAt: at(900_000), connectedAt: at(880_000), lastSeenAt: at(2_000) }],
  }
}
