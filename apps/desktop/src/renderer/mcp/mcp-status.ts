import type { McpStatusView } from '../../shared/contract.js'

/**
 * Turns an observation into what the footer says. It is a plain function so the
 * wording of every state can be tested without rendering anything.
 *
 * The rule the whole feature rests on: each state names what was observed, not
 * what is assumed. Nothing here may turn an absence of evidence into a claim.
 * "No connection observed" and "Stopped" sound alike and mean different things —
 * the app cannot see a client's process, so it can only ever say the first.
 *
 * The shared connection adds a trap of its own: a client connected to it can
 * reach every enabled project, which is not the same as working on this one. So
 * it reads as "available" here, with any observed use reported separately, and
 * never as the "connected" a project-bound server earns.
 */

export type McpState =
  | 'connected'
  | 'available'
  | 'running'
  | 'not_enabled'
  | 'not_connected'
  | 'runtime_missing'
  | 'unknown'

export interface McpDisplay {
  state: McpState
  /** The indicator's own text. Color never carries the state on its own. */
  label: string
  /** One sentence naming what was actually observed, for the accessible description. */
  summary: string
  /** What the user can do about it, if anything. */
  guidance: string[]
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** "just now" / "4 minutes ago" — deliberately coarse, since it is an observation age. */
export function describeAge(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return 'at an unknown time'

  const elapsed = now - at
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) {
    const minutes = Math.round(elapsed / MINUTE)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  const hours = Math.round(elapsed / HOUR)
  return `${hours} hour${hours === 1 ? '' : 's'} ago`
}

const ENABLE_STEP =
  'Turn on Allow AI access through MCP below. The client picks it up on its next call; ' +
  'its configuration does not change.'

const CONNECT_STEPS = [
  'Copy the MCP configuration below and add it to your AI client. You only do this once: ' +
    'it covers every project you allow.',
  'Start or restart the client so it launches the server.',
]

/** The one sentence about use of this project through the shared connection. */
export function describeActivity(status: McpStatusView, now: number = Date.now()): string {
  return status.lastActivityAt === null
    ? 'No call to this project has been observed from it yet.'
    : `It last worked on this project ${describeAge(status.lastActivityAt, now)}.`
}

export function describeMcpStatus(status: McpStatusView, now: number = Date.now()): McpDisplay {
  if (status.unobservable !== null) {
    return {
      state: 'unknown',
      label: 'MCP status unknown',
      summary: `The project folder could not be read, so nothing could be observed: ${status.unobservable}`,
      guidance: [
        'This says nothing about whether a server is running — only that this window could not look.',
      ],
    }
  }

  const connected = status.live.filter((session) => session.connectedAt !== null)
  if (connected.length > 0) {
    const noun = connected.length === 1 ? 'An AI client is' : `${connected.length} AI clients are`
    return {
      state: 'connected',
      label: connected.length === 1 ? 'MCP connected' : `MCP connected (${connected.length})`,
      summary: `${noun} connected to a server for this project. Last confirmed ${describeAge(
        latestBeat(status),
        now,
      )}.`,
      guidance: [],
    }
  }

  if (status.access.problem !== null) {
    return {
      state: 'unknown',
      label: 'MCP access unknown',
      summary:
        'The list of projects allowed for AI access could not be read, so the shared ' +
        `connection reaches no project: ${status.access.problem}`,
      guidance: [
        'The file was left untouched. Repair it, or remove it and allow your projects again.',
      ],
    }
  }

  const sharedConnected = status.shared.filter((session) => session.connectedAt !== null)
  if (sharedConnected.length > 0) {
    if (!status.access.enabled) {
      return {
        state: 'not_enabled',
        label: 'MCP not allowed here',
        summary:
          'An AI client is connected to the shared Knightbook connection, but this project is ' +
          'not allowed for it, so the client cannot reach it.',
        guidance: [ENABLE_STEP],
      }
    }
    return {
      state: 'available',
      label: 'MCP available',
      summary:
        'An AI client is connected to the shared Knightbook connection, and this project is ' +
        `allowed for it. ${describeActivity(status, now)}`,
      guidance: [],
    }
  }

  if (status.live.length > 0 || status.shared.length > 0) {
    return {
      state: 'running',
      label: 'MCP server running',
      summary:
        status.live.length > 0
          ? 'A server process is running for this project, but no client has opened a connection to it yet.'
          : 'A shared server process is running, but no client has opened a connection to it yet.',
      guidance: ['If your AI client is starting up, this usually resolves on its own.'],
    }
  }

  if (status.runtimeProblem !== null) {
    return {
      state: 'runtime_missing',
      label: 'MCP runtime not copied',
      summary:
        'This app runs as an AppImage, so it copies the bundled server to a folder that lasts ' +
        'between launches. That copy failed, so the copied configuration may not start anything.',
      // The reason itself is on the runtime line of the details, not repeated here.
      guidance: [
        'Free some space or fix the folder permissions, then reopen the app to try again.',
      ],
    }
  }

  if (!status.runtimeAvailable) {
    return {
      state: 'runtime_missing',
      label: 'MCP runtime missing',
      summary:
        'The bundled server this app hands your AI client is not where it should be, so the ' +
        'copied configuration would not start anything.',
      guidance: [
        'Reinstall the app, or run a full build if you are working from a source checkout.',
      ],
    }
  }

  return {
    state: 'not_connected',
    label: 'MCP not connected',
    summary: status.stale.length
      ? `No running server was observed for this project. A previous session stopped without ` +
        `cleaning up; it was last seen ${describeAge(latestBeat(status), now)}.`
      : 'No running server was observed for this project.',
    guidance: status.access.enabled ? CONNECT_STEPS : [ENABLE_STEP, ...CONNECT_STEPS],
  }
}

/** The most recent heartbeat across everything observed, live or not. */
function latestBeat(status: McpStatusView): string {
  const all = [...status.live, ...status.stale]
  return all.reduce(
    (newest, session) =>
      Date.parse(session.lastSeenAt) > Date.parse(newest) ? session.lastSeenAt : newest,
    all[0]?.lastSeenAt ?? new Date(0).toISOString(),
  )
}
