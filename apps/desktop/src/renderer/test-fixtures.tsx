import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { App } from './App.js'
import type {
  McpStatusView,
  ProjectView,
  KnightbookApi,
  RememberedProject,
  ReviewChangesView,
  TicketDetailView,
  TicketView,
} from '../shared/contract.js'

/** Shared by the component tests so each file states only what it is about. */

export const CHECKOUT = 'C:\\projects\\demo'
export const TICKET_ID = '11111111-1111-4111-8111-111111111111'

export function ticket(overrides: Partial<TicketView> = {}): TicketView {
  return {
    id: TICKET_ID,
    title: 'A ticket',
    status: 'backlog',
    type: null,
    revision: 'rev-1',
    dependsOn: [],
    dependencyReady: true,
    dependencyNotes: [],
    blocker: null,
    verificationIssue: null,
    affectedBy: [],
    completion: null,
    completionUnattributed: false,
    review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
    archivedAt: null,
    ...overrides,
  }
}

export function project(overrides: Partial<ProjectView> = {}): ProjectView {
  return {
    name: 'Demo',
    checkoutPath: CHECKOUT,
    tickets: [ticket()],
    archivedTickets: [],
    problems: [],
    nextTicketId: null,
    nextExplanation: '',
    backlogOrderProblems: { duplicates: [], unknown: [] },
    ...overrides,
  }
}

/** The detail the host returns for a ticket, defaulting to the same ticket as `ticket()`. */
export function detail(overrides: Partial<TicketDetailView> = {}): TicketDetailView {
  return {
    ...ticket(),
    body: '# A ticket\n\n## Intended outcome\n\nWhat the author wrote.\n',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
    relatedDocuments: [],
    dependencies: [],
    previousCompletions: [],
    ...overrides,
  }
}

export const REMEMBERED: RememberedProject = { path: CHECKOUT, name: 'Demo', unavailable: null }

/** Nothing running, runtime present: the state a user sees before they connect. */
export function mcpStatus(overrides: Partial<McpStatusView> = {}): McpStatusView {
  return {
    checkoutPath: CHECKOUT,
    observedAt: new Date().toISOString(),
    unobservable: null,
    runtimeAvailable: true,
    live: [],
    stale: [],
    access: { checkoutPath: CHECKOUT, enabled: false, checkoutId: null, problem: null },
    shared: [],
    lastActivityAt: null,
    ...overrides,
  }
}

/** One live session with a client attached. */
export function connectedSession(overrides: Partial<McpStatusView> = {}): McpStatusView {
  const now = new Date().toISOString()
  return mcpStatus({
    live: [{ pid: 4242, startedAt: now, connectedAt: now, lastSeenAt: now }],
    ...overrides,
  })
}

/**
 * What a board mutation answers by default: it succeeded and the board is as it
 * was. The app replaces the board with whatever comes back, so a bare `vi.fn()`
 * here (resolving to undefined) made it read `.ok` off nothing — an unhandled
 * error that left every test looking green. A test that cares about the board
 * after a mutation, or about a failure, still overrides it.
 */
function boardUnchanged() {
  return vi.fn().mockImplementation(async () => ({ ok: true, value: project() }))
}

/** A record nobody has reviewed: there is nothing to compare against. */
export function noBaseline(): ReviewChangesView {
  return {
    state: 'no_baseline',
    reviewedAt: null,
    currentRevision: 'rev-current',
    unreadableSnapshots: 0,
    substantive: null,
    sections: [],
    notes: [],
    tooLarge: null,
  }
}

export function makeApi(): KnightbookApi {
  return {
    rememberedProjects: vi.fn().mockResolvedValue([REMEMBERED]),
    forgetProject: vi.fn().mockResolvedValue([]),
    chooseProject: vi.fn(),
    inspectFolder: vi.fn().mockResolvedValue({ ok: true, value: { name: 'app', suggestions: [] } }),
    setUpFolder: vi.fn(),
    readProject: vi.fn().mockResolvedValue({ ok: true, value: project() }),
    setTicketStatus: boardUnchanged(),
    setTicketType: boardUnchanged(),
    completeTicket: boardUnchanged(),
    recordVerificationIssue: boardUnchanged(),
    resolveVerificationIssue: boardUnchanged(),
    recordTicketReview: boardUnchanged(),
    archiveTickets: vi.fn(),
    restoreTicket: boardUnchanged(),
    readTicket: vi.fn().mockResolvedValue({ ok: true, value: detail() }),
    reorderBacklog: boardUnchanged(),
    searchTickets: vi.fn().mockResolvedValue({
      ok: true,
      value: { checkoutPath: CHECKOUT, query: '', hits: [], totalMatches: 0, unsearchable: [] },
    }),
    mcpLaunchCommand: vi.fn().mockResolvedValue({
      command: 'node.exe',
      args: ['server.mjs', '--registry', 'access.json'],
    }),
    setMcpAccess: vi.fn(),
    mcpStatus: vi.fn().mockResolvedValue(mcpStatus()),
    readSettings: vi.fn().mockResolvedValue({ colorScheme: 'auto' }),
    saveSettings: vi.fn().mockResolvedValue({ ok: true, value: { colorScheme: 'auto' } }),
    listDocuments: vi.fn().mockResolvedValue({ ok: true, value: { documents: [], problems: [] } }),
    includeDocumentFiles: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [] } }),
    includeDocumentFolder: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [] } }),
    removeDocumentEntry: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [] } }),
    readDocument: vi.fn(),
    reviewDocument: vi.fn(),
    documentChanges: vi.fn().mockResolvedValue({ ok: true, value: noBaseline() }),
    ticketChanges: vi.fn().mockResolvedValue({ ok: true, value: noBaseline() }),
    openDocumentExternally: vi.fn(),
    // Every link reaches the document it names unless a test says otherwise.
    resolveLink: vi.fn().mockImplementation(async (_root: string, path: string) => ({
      ok: true,
      value: { kind: 'document', path },
    })),
    openExternalLink: vi.fn().mockResolvedValue({ ok: true, value: null }),
  }
}

/** `env="test"` disables Mantine's transitions, which otherwise race the queries. */
export function renderApp() {
  return render(
    <MantineProvider env="test">
      <App />
    </MantineProvider>,
  )
}
