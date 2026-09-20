import { describe, expect, it } from 'vitest'
import type { McpSessionView, McpStatusView } from '../shared/contract.js'
import { describeAge, describeMcpStatus } from './mcp-status.js'

/**
 * The wording is the feature. An indicator that says "connected" without a
 * connection, or "stopped" for something it simply cannot see, is worse than no
 * indicator at all, so each state is pinned to the evidence that produces it.
 */

const NOW = Date.parse('2026-09-19T12:00:00Z')

function at(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString()
}

function session(overrides: Partial<McpSessionView> = {}): McpSessionView {
  return { pid: 500, startedAt: at(60_000), connectedAt: null, lastSeenAt: at(2_000), ...overrides }
}

function status(overrides: Partial<McpStatusView> = {}): McpStatusView {
  return {
    checkoutPath: 'C:\\projects\\demo',
    observedAt: at(0),
    unobservable: null,
    runtimeAvailable: true,
    live: [],
    stale: [],
    ...overrides,
  }
}

describe('describing MCP status', () => {
  it('reports a connection only when a client actually opened one', () => {
    const display = describeMcpStatus(status({ live: [session({ connectedAt: at(30_000) })] }), NOW)
    expect(display.state).toBe('connected')
    expect(display.label).toBe('MCP connected')
  })

  it('separates a running server from a connected client', () => {
    const display = describeMcpStatus(status({ live: [session({ connectedAt: null })] }), NOW)
    expect(display.state).toBe('running')
    expect(display.summary).toContain('no client has opened a connection')
  })

  it('counts more than one connected client', () => {
    const display = describeMcpStatus(
      status({
        live: [
          session({ pid: 1, connectedAt: at(10_000) }),
          session({ pid: 2, connectedAt: at(20_000) }),
        ],
      }),
      NOW,
    )
    expect(display.label).toBe('MCP connected (2)')
  })

  it('says nothing was observed rather than claiming the server is stopped', () => {
    const display = describeMcpStatus(status(), NOW)
    expect(display.state).toBe('not_connected')
    expect(display.summary).toContain('No running server was observed')
    expect(display.summary.toLowerCase()).not.toContain('stopped')
  })

  it('explains a record left behind by a server that did not shut down cleanly', () => {
    const display = describeMcpStatus(
      status({ stale: [session({ connectedAt: at(3_600_000), lastSeenAt: at(600_000) })] }),
      NOW,
    )
    expect(display.state).toBe('not_connected')
    expect(display.summary).toContain('stopped without cleaning up')
    expect(display.summary).toContain('10 minutes ago')
  })

  it('reports unknown when the folder could not be read, never an absence', () => {
    const display = describeMcpStatus(status({ unobservable: 'EPERM: permission denied' }), NOW)
    expect(display.state).toBe('unknown')
    expect(display.summary).toContain('EPERM')
    expect(display.guidance.join(' ')).toContain('could not look')
  })

  it('flags a missing bundled runtime as actionable', () => {
    const display = describeMcpStatus(status({ runtimeAvailable: false }), NOW)
    expect(display.state).toBe('runtime_missing')
    expect(display.guidance.join(' ')).toContain('Reinstall')
  })

  it('trusts a live connection over a missing bundled runtime', () => {
    // A source checkout can serve MCP from a path this app does not stage.
    const display = describeMcpStatus(
      status({ runtimeAvailable: false, live: [session({ connectedAt: at(5_000) })] }),
      NOW,
    )
    expect(display.state).toBe('connected')
  })
})

describe('describing an observation age', () => {
  it('reads recent times as just now', () => {
    expect(describeAge(at(3_000), NOW)).toBe('just now')
  })

  it('uses singular and plural correctly', () => {
    expect(describeAge(at(60_000), NOW)).toBe('1 minute ago')
    expect(describeAge(at(300_000), NOW)).toBe('5 minutes ago')
    expect(describeAge(at(7_200_000), NOW)).toBe('2 hours ago')
  })

  it('does not invent a time it cannot parse', () => {
    expect(describeAge('not a date', NOW)).toBe('at an unknown time')
  })
})
