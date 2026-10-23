import type { ProjectView, KnightbookApi, TicketView } from '../src/shared/contract.js'
import type { RememberedProject } from '../src/shared/project-setup-contract.js'
import { documentsStub } from './documents-stub.js'
import { setStubAllowed, stubMcpStatus } from './mcp-status-stub.js'
import { record } from './record.js'
import { boardPlansStub, plansStub } from './plans-stub.js'
import { routinesStub } from './routines-stub.js'
import { skillSetupStub } from './skill-setup-stub.js'
import { stubReviewChanges } from './review-changes-stub.js'
import { stubTicketDetail } from './ticket-detail-stub.js'
import { stubDocumentSearch, stubTicketSearch } from './ticket-search-stub.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'

/**
 * A stand-in host for the design preview. It serves the same shapes the real
 * IPC bridge returns, so the preview exercises the actual components rather than
 * a mock-up of them.
 */

function ticket(
  partial: Partial<TicketView> & Pick<TicketView, 'id' | 'title' | 'status'>,
): TicketView {
  return {
    revision: `rev-${partial.id}`,
    type: null,
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
    ...partial,
  }
}

/** Add ?problems to the preview URL to see the unreadable-records banner. */
const UNREADABLE = new URLSearchParams(window.location.search).has('problems')
  ? [
      {
        file: '.projectspace/tickets/3f2a9c1e-7b64-4d0a-9e51-0c8d2b7a44f1.md',
        reason:
          '.projectspace/tickets/3f2a9c1e-7b64-4d0a-9e51-0c8d2b7a44f1.md contains unresolved merge conflict markers. Resolve them before editing here.',
      },
      {
        file: '.projectspace/tickets/b81d0e22-5c3f-4a17-8f60-92aa1d3c6e05.md',
        reason:
          'Ticket b81d0e22 is not valid: status must be one of backlog, in_progress, verification, done.',
      },
    ]
  : []

const PROJECT: ProjectView = {
  /** One archived card, so the Archive tab has something to show. */
  archivedTickets: [
    ticket({
      id: '5e0a7c21-9d4b-4f3e-8a61-2b7c9e1d0f34',
      title: 'Explore a hosted sync service',
      status: 'backlog',
      archivedAt: '2026-09-21T16:30:00Z',
    }),
  ],
  name: 'Knightbook',
  problems: UNREADABLE,
  checkoutPath: String.raw`C:\Users\Denny\Projects\knightbook-demo`,
  nextTicketId: 'board',
  nextExplanation: '',
  backlogOrderProblems: { duplicates: [], unknown: [] },
  plans: boardPlansStub,
  tickets: [
    ticket({
      id: 'board',
      type: 'feature',
      title: 'Build the Kanban board',
      status: 'backlog',
    }),
    ticket({
      id: 'review',
      title: 'Track human review status',
      status: 'backlog',
      dependencyReady: false,
      dependsOn: ['board', 'editor'],
      dependencyNotes: [
        'waiting on "Build the Kanban board" (board), which is backlog',
        'waiting on "Evaluate the formatted editor" (editor), which is in_progress',
      ],
      unmetPrerequisites: [
        'waiting on "Build the Kanban board" (board), which is backlog',
        'waiting on "Evaluate the formatted editor" (editor), which is in_progress',
      ],
    }),
    // Prerequisites all met, held back only by its own blocker.
    ticket({
      id: 'release',
      type: 'feature',
      title: 'Publish a release from the release branch',
      status: 'backlog',
      dependsOn: ['writes'],
      dependencyReady: false,
      dependencyNotes: ['is blocked: Deferred until the user decides to start it.'],
      prerequisitesMet: true,
      blocker: 'Deferred until the user decides to start it.',
    }),
    ticket({
      id: 'editor',
      type: 'task',
      title: 'Evaluate the formatted editor',
      status: 'in_progress',
      blocker: 'Milkdown 7.22.1 drops inline HTML; waiting on the upstream release.',
    }),
    ticket({
      id: 'writes',
      type: 'feature',
      // Long on purpose: the dialog header has to wrap this without pushing Close
      // off the side, and the card has to keep its title on one column.
      title:
        'Implement the safe write path, including the temporary file, the rename, and the revision check that refuses a stale write',
      status: 'verification',
      review: {
        state: 'changed_since_review',
        lastReviewedAt: '2026-09-18T14:00:00Z',
        changeSummary:
          'The content changed in a way that is not only formatting or status. ' +
          'Whether the meaning changed has not been determined.',
      },
    }),
    /** D-017: a prerequisite the user did not accept, and the work resting on it. */
    ticket({
      id: 'importer',
      type: 'bug',
      title: 'Import dated records',
      status: 'verification',
      verificationIssue: {
        reason: 'Every imported date is an hour off around the daylight-saving change.',
        decisionSource: 'direct_user_action',
        recordedBy: 'user',
        recordedAt: '2026-09-20T08:00:00Z',
      },
    }),
    ticket({
      id: 'report',
      title: 'Summarize records by week',
      status: 'backlog',
      dependsOn: ['importer'],
      dependencyReady: false,
      dependencyNotes: [
        'rests on "Import dated records" (importer), which failed verification: ' +
          'Every imported date is an hour off around the daylight-saving change.',
      ],
      unmetPrerequisites: [
        'rests on "Import dated records" (importer), which failed verification: ' +
          'Every imported date is an hour off around the daylight-saving change.',
      ],
      affectedBy: [
        {
          ticketId: 'importer',
          title: 'Import dated records',
          issue: 'Every imported date is an hour off around the daylight-saving change.',
          direct: true,
        },
      ],
    }),
    ticket({
      id: 'schema',
      title: 'Define the Markdown record schema',
      status: 'done',
      review: { state: 'reviewed', lastReviewedAt: '2026-09-18T09:00:00Z', changeSummary: null },
      completion: {
        decisionSource: 'direct_user_action',
        recordedBy: 'user',
        recordedAt: '2026-09-19T09:00:00Z',
        instruction: 'Moved to Done in the app.',
      },
    }),
    ticket({
      id: 'packaging',
      title: 'Package the MCP runtime',
      status: 'done',
      completion: {
        decisionSource: 'reported_user_instruction',
        recordedBy: 'agent',
        recordedAt: '2026-09-19T09:30:00Z',
        instruction: 'User checked the packaged build and said it is complete.',
      },
    }),
    ticket({
      id: 'stray',
      type: 'bug',
      title: 'Edited outside the app',
      status: 'done',
      completionUnattributed: true,
    }),
    // Enough of them to show Done collapsed, which is how a working board looks.
    ...[
      'Shared core library',
      'MCP server over stdio',
      'Bundled MCP runtime',
      'Document viewer',
    ].map((title, index) =>
      ticket({
        id: `older-${index}`,
        title,
        status: 'done',
        review: {
          state: 'reviewed',
          lastReviewedAt: '2026-09-17T09:00:00Z',
          changeSummary: null,
        },
        completion: {
          decisionSource: 'direct_user_action',
          recordedBy: 'user',
          recordedAt: `2026-09-1${5 + index}T09:00:00Z`,
          instruction: 'Moved to Done in the app.',
        },
      }),
    ),
  ],
}

const REMEMBERED: RememberedProject[] = [
  { path: PROJECT.checkoutPath, name: PROJECT.name, unavailable: null },
  { path: 'C:\\projects\\second-app', name: 'Second app', unavailable: null },
  {
    path: 'D:\\old\\archived',
    name: 'Archived',
    unavailable: 'This folder was not found. It may have been moved, renamed, or deleted.',
  },
]

export const stubApi: KnightbookApi = {
  rememberedProjects: async () => REMEMBERED,
  forgetProject: async (path) => {
    record('forgetProject', path)
    return REMEMBERED.filter((project) => project.path !== path)
  },
  // Add ?setup to the preview URL to walk the uninitialized-folder screen.
  chooseProject: async () =>
    new URLSearchParams(window.location.search).has('setup')
      ? { path: 'C:\\code\\my-app', initialized: false }
      : { path: PROJECT.checkoutPath, initialized: true },
  inspectFolder: async () => ({
    ok: true,
    value: { name: 'my-app', suggestions: ['README.md', 'docs'] },
  }),
  setUpFolder: async (path, name, include) => {
    record('setUpFolder', path, name, include)
    return { ok: true, value: { path, warning: null } }
  },
  readProject: async () => {
    record('readProject')
    return { ok: true, value: PROJECT }
  },
  setTicketStatus: async (_root, id, status) => {
    record('setTicketStatus', id, status)
    return { ok: true, value: PROJECT }
  },
  setTicketType: async (_root, id, type) => {
    record('setTicketType', id, type)
    return { ok: true, value: PROJECT }
  },
  setTicketBlocker: async (_root, id, blocker) => {
    record('setTicketBlocker', id, blocker)
    return { ok: true, value: PROJECT }
  },
  editTicketContent: async (_root, id, content) => {
    record('editTicketContent', id, content.title)
    return { ok: true, value: PROJECT }
  },
  setTicketLinks: async (_root, id, links) => {
    record('setTicketLinks', id, links.dependsOn.length, links.relatedDocuments.length)
    return { ok: true, value: PROJECT }
  },
  completeTicket: async (_root, id) => {
    record('completeTicket', id)
    return { ok: true, value: PROJECT }
  },
  recordVerificationIssue: async (_root, id, _revision, reason) => {
    record('recordVerificationIssue', id, reason)
    return { ok: true, value: PROJECT }
  },
  resolveVerificationIssue: async (_root, id) => {
    record('resolveVerificationIssue', id)
    return { ok: true, value: PROJECT }
  },
  recordTicketReview: async (_root, id) => {
    record('recordTicketReview', id)
    return { ok: true, value: PROJECT }
  },
  archiveTickets: async (_root, targets) => {
    record('archiveTickets', targets)
    return { ok: true, value: { archivedCount: targets.length, failures: [], project: PROJECT } }
  },
  restoreTicket: async (_root, id) => {
    record('restoreTicket', id)
    return { ok: true, value: PROJECT }
  },
  readTicket: async (_root, id) => {
    record('readTicket', id)
    return stubTicketDetail(PROJECT, id)
  },
  // Add ?createFails to the preview URL to see the form keep a failed write open.
  createTicket: async (_root, input) => {
    record('createTicket', input)
    if (new URLSearchParams(window.location.search).has('createFails')) {
      return {
        ok: false,
        code: 'locked',
        message: 'Another Knightbook process is writing to this project. Try again.',
      }
    }
    const id = `new-${PROJECT.tickets.length}`
    PROJECT.tickets.splice(
      PROJECT.tickets.filter((t) => t.status === 'backlog').length,
      0,
      ticket({ id, title: input.title, status: 'backlog', type: input.type }),
    )
    return { ok: true, value: { id, project: { ...PROJECT, tickets: [...PROJECT.tickets] } } }
  },
  openTicketExternally: async (_root, id) => {
    record('openTicketExternally', id)
    return { ok: true, value: null }
  },
  reorderBacklog: async (_root, ticketIds) => {
    record('reorderBacklog', ticketIds)
    return { ok: true, value: PROJECT }
  },
  searchDocuments: async (root, query) => {
    record('searchDocuments', query)
    return stubDocumentSearch(
      root,
      query,
      [
        { path: 'README.md', title: 'README' },
        { path: 'docs/architecture.md', title: 'architecture' },
      ],
      SAMPLE_DOCUMENT,
    )
  },
  searchTickets: async (root, query) => {
    record('searchTickets', query)
    return { ok: true, value: stubTicketSearch(PROJECT, root, query) }
  },
  // Add ?light to the preview URL to start in the light scheme.
  readSettings: async () => ({
    colorScheme: new URLSearchParams(window.location.search).has('light') ? 'light' : 'dark',
  }),
  saveSettings: async (patch) => {
    record('saveSettings', patch)
    return { ok: true, value: { colorScheme: patch.colorScheme ?? 'auto' } }
  },
  appVersion: async () => '0.0.0',
  showProjectInWindowTitle: async (project) => {
    record('showProjectInWindowTitle', project)
  },
  ...skillSetupStub,
  ...plansStub,
  ...routinesStub,

  mcpLaunchCommand: async () => ({
    command: String.raw`C:\Program Files\Knightbook\resources\mcp\node.exe`,
    args: [
      String.raw`C:\Program Files\Knightbook\resources\mcp\server.mjs`,
      '--registry',
      String.raw`C:\Users\you\AppData\Roaming\Knightbook\mcp-access.json`,
    ],
  }),

  /**
   * Add ?mcp=running|none|stale|missing|unknown|shared|shared-idle|access-broken
   * to review each footer state.
   */
  mcpStatus: async (root) => stubMcpStatus(root),
  setMcpAccess: async (root, enabled) => {
    setStubAllowed(enabled)
    return {
      ok: true,
      value: { checkoutPath: root, enabled, checkoutId: enabled ? 'c-1' : null, problem: null },
    }
  },

  ...documentsStub,
  ticketChanges: async (_root, id) => {
    record('ticketChanges', id)
    return stubReviewChanges(PROJECT.tickets.find((t) => t.id === id)?.revision ?? 'rev-unknown')
  },
}
