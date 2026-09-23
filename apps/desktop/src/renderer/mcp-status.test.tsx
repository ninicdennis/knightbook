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
    access: { checkoutPath: 'C:\\projects\\demo', enabled: false, checkoutId: null, problem: null },
    shared: [],
    lastActivityAt: null,
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

describe('describing the shared connection', () => {
  const allowed = {
    checkoutPath: 'C:\\projects\\demo',
    enabled: true,
    checkoutId: 'c1',
    problem: null,
  }

  it('calls a shared client available here, never connected to this project', () => {
    const display = describeMcpStatus(
      status({ access: allowed, shared: [session({ connectedAt: at(30_000) })] }),
      NOW,
    )
    expect(display.state).toBe('available')
    expect(display.label).toBe('MCP available')
    expect(display.summary).toMatch(/No call to this project has been observed/)
  })

  it('reports observed use of this project separately', () => {
    const display = describeMcpStatus(
      status({
        access: allowed,
        shared: [session({ connectedAt: at(30_000) })],
        lastActivityAt: at(120_000),
      }),
      NOW,
    )
    expect(display.summary).toMatch(/last worked on this project 2 minutes ago/)
  })

  it('says a connected shared client cannot reach a project that is not allowed', () => {
    const display = describeMcpStatus(
      status({ shared: [session({ connectedAt: at(30_000) })] }),
      NOW,
    )
    expect(display.state).toBe('not_enabled')
    expect(display.guidance.join(' ')).toMatch(/Allow AI access through MCP/)
  })

  it('does not read an unreadable access list as "not allowed"', () => {
    const display = describeMcpStatus(
      status({
        access: { ...allowed, enabled: false, problem: 'Unexpected token' },
        shared: [session({ connectedAt: at(30_000) })],
      }),
      NOW,
    )
    expect(display.state).toBe('unknown')
    expect(display.summary).toMatch(/could not be read/)
  })

  it('asks for the setting before the configuration when neither is done', () => {
    const display = describeMcpStatus(status(), NOW)
    expect(display.state).toBe('not_connected')
    expect(display.guidance[0]).toMatch(/Allow AI access through MCP/)
  })

  it('does not repeat the setting step once it is on', () => {
    const display = describeMcpStatus(status({ access: allowed }), NOW)
    expect(display.guidance.join(' ')).not.toMatch(/Allow AI access/)
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
