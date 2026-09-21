import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { App } from './App.js'
import type {
  McpStatusView,
  ProjectView,
  KnightbookApi,
  RememberedProject,
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
    ...overrides,
  }
}

export function project(overrides: Partial<ProjectView> = {}): ProjectView {
  return {
    name: 'Demo',
    checkoutPath: CHECKOUT,
    tickets: [ticket()],
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

export function makeApi(): KnightbookApi {
  return {
    rememberedProjects: vi.fn().mockResolvedValue([REMEMBERED]),
    forgetProject: vi.fn().mockResolvedValue([]),
    chooseProject: vi.fn(),
    inspectFolder: vi.fn().mockResolvedValue({ ok: true, value: { name: 'app', suggestions: [] } }),
    setUpFolder: vi.fn(),
    readProject: vi.fn().mockResolvedValue({ ok: true, value: project() }),
    setTicketStatus: vi.fn(),
    setTicketType: vi.fn(),
    completeTicket: vi.fn(),
    recordVerificationIssue: vi.fn(),
    resolveVerificationIssue: vi.fn(),
    recordTicketReview: vi.fn(),
    readTicket: vi.fn().mockResolvedValue({ ok: true, value: detail() }),
    reorderBacklog: vi.fn(),
    searchTickets: vi.fn().mockResolvedValue({
      ok: true,
      value: { checkoutPath: CHECKOUT, query: '', hits: [], totalMatches: 0, unsearchable: [] },
    }),
    mcpLaunchCommand: vi
      .fn()
      .mockResolvedValue({ command: 'node.exe', args: ['server.mjs', '--root', 'demo'] }),
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
    openDocumentExternally: vi.fn(),
    openExternalLink: vi.fn(),
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
