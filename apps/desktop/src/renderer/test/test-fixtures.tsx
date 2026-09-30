import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from '../App.js'
import type {
  McpStatusView,
  ProjectView,
  KnightbookApi,
  ReviewChangesView,
  TicketDetailView,
  TicketView,
} from '../../shared/contract.js'
import type { RememberedProject } from '../../shared/project-setup-contract.js'
import type { SkillSetupView } from '../../shared/skill-setup-contract.js'

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
    unmetPrerequisites: [],
    prerequisitesMet: false,
    dependencyCycle: null,
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
    plans: [],
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
    plans: [],
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

/** Nothing installed anywhere yet. */
export function skillSetup(overrides: Partial<SkillSetupView> = {}): SkillSetupView {
  return {
    files: ['SKILL.md'],
    skillText: '---\nname: projectspace\n---\n\n# Working in a Knightbook project\n',
    targets: [
      {
        id: 'claude-personal',
        client: 'Claude Code',
        scope: 'personal',
        path: String.raw`C:\Users\me\.claude\skills\projectspace`,
        state: 'absent',
      },
      {
        id: 'claude-project',
        client: 'Claude Code',
        scope: 'project',
        path: String.raw`${CHECKOUT}\.claude\skills\projectspace`,
        state: 'absent',
      },
      {
        id: 'codex-personal',
        client: 'Codex',
        scope: 'personal',
        path: String.raw`C:\Users\me\.agents\skills\projectspace`,
        state: 'absent',
      },
      {
        id: 'codex-project',
        client: 'Codex',
        scope: 'project',
        path: String.raw`${CHECKOUT}\.agents\skills\projectspace`,
        state: 'absent',
      },
    ],
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
    setTicketBlocker: boardUnchanged(),
    editTicketContent: boardUnchanged(),
    setTicketLinks: boardUnchanged(),
    completeTicket: boardUnchanged(),
    recordVerificationIssue: boardUnchanged(),
    resolveVerificationIssue: boardUnchanged(),
    recordTicketReview: boardUnchanged(),
    archiveTickets: vi.fn(),
    restoreTicket: boardUnchanged(),
    readTicket: vi.fn().mockResolvedValue({ ok: true, value: detail() }),
    openTicketExternally: vi.fn().mockResolvedValue({ ok: true, value: null }),
    createTicket: vi.fn(),
    reorderBacklog: boardUnchanged(),
    searchDocuments: vi.fn().mockImplementation(async (_root: string, query: string) => ({
      ok: true,
      value: { checkoutPath: CHECKOUT, query, hits: [], totalMatches: 0, unsearchable: [] },
    })),
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
    showProjectInWindowTitle: vi.fn().mockResolvedValue(undefined),
    skillSetup: vi.fn().mockResolvedValue({ ok: true, value: skillSetup() }),
    installSkill: vi.fn(),
    exportSkill: vi.fn().mockResolvedValue({ ok: true, value: null }),
    listPlans: vi.fn().mockResolvedValue({ ok: true, value: { plans: [], problems: [] } }),
    openPlanExternally: vi.fn().mockResolvedValue({ ok: true, value: null }),
    listDocuments: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [], folderTitles: [] } }),
    setDocumentFolderTitle: vi.fn(),
    includeDocumentFiles: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [], folderTitles: [] } }),
    includeDocumentFolder: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [], folderTitles: [] } }),
    removeDocumentEntry: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { documents: [], problems: [], folderTitles: [] } }),
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
    createDocument: vi.fn(),
    // No image exists unless a test provides one.
    readProjectImage: vi.fn().mockImplementation(async (_root: string, path: string) => ({
      ok: true,
      value: {
        kind: 'unavailable',
        reason: 'not_found',
        message: `${path} does not exist in this project.`,
      },
    })),
  }
}

/**
 * `env="test"` disables Mantine's transitions, which otherwise race the queries.
 * It still leaves each Transition scheduling an animation frame and a timeout
 * when it opens or closes, and one that fires after a fast test file has torn
 * down jsdom fails the run with "window is not defined". Honouring reduced
 * motion, which test-setup.ts reports, makes those changes synchronous instead.
 */
/**
 * How long to wait for the footer's first MCP reading. The button appears only
 * after the project loads, the footer mounts and its first status read returns,
 * and the first role query in a file walks a cold DOM. Locally that is under
 * 200 ms, but on a busy CI runner with test files in parallel workers it passed
 * the 1 s default once (ticket a79c7639). A longer bound only changes how long a
 * genuinely missing button takes to fail, not whether it does. It stays well
 * under Vitest's 5 s test timeout, so a missing button still fails with this
 * query's own message and DOM dump rather than as a bare test timeout.
 */
export const FIRST_MCP_READING_MS = 3_000

/** The footer's MCP status button, once its first reading has arrived. */
export async function findMcpStatusButton(
  name: RegExp = /MCP not connected/i,
  timeout = FIRST_MCP_READING_MS,
): Promise<HTMLElement> {
  return await screen.findByRole('button', { name }, { timeout })
}

export function renderApp() {
  return render(
    <MantineProvider env="test" theme={{ respectReducedMotion: true }}>
      <App />
    </MantineProvider>,
  )
}

/**
 * Opens the ticket dialog's Edit menu and picks one entry. The menu renders in
 * a portal, so its items are found on the whole screen, not inside the dialog.
 */
export async function chooseEdit(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  item: string,
) {
  await user.click(within(dialog).getByRole('button', { name: 'Edit ticket' }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}
