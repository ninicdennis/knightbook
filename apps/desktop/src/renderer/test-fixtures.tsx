import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { App } from './App.js'
import type {
  ProjectView,
  ProjectspaceApi,
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
    revision: 'rev-1',
    dependsOn: [],
    dependencyReady: true,
    dependencyNotes: [],
    blocker: null,
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
    nextTicketId: null,
    nextExplanation: '',
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
    ...overrides,
  }
}

export function makeApi(): ProjectspaceApi {
  return {
    recentProjects: vi.fn().mockResolvedValue([CHECKOUT]),
    chooseProject: vi.fn(),
    readProject: vi.fn().mockResolvedValue({ ok: true, value: project() }),
    setTicketStatus: vi.fn(),
    completeTicket: vi.fn(),
    recordTicketReview: vi.fn(),
    readTicket: vi.fn().mockResolvedValue({ ok: true, value: detail() }),
    mcpLaunchCommand: vi
      .fn()
      .mockResolvedValue({ command: 'node.exe', args: ['server.mjs', '--root', 'demo'] }),
    listDocuments: vi.fn().mockResolvedValue({ ok: true, value: { documents: [], problems: [] } }),
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
