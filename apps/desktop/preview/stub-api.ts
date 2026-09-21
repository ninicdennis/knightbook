import type {
  McpStatusView,
  ProjectView,
  KnightbookApi,
  RememberedProject,
  TicketView,
} from '../src/shared/contract.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'
import { stubTicketDetail } from './ticket-detail-stub.js'
import { stubTicketSearch } from './ticket-search-stub.js'

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
    blocker: null,
    verificationIssue: null,
    affectedBy: [],
    completion: null,
    completionUnattributed: false,
    review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
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

/**
 * The footer has five states and only one of them is reachable by luck, so the
 * preview picks between them from the URL the same way `?problems` does.
 */
function stubMcpStatus(root: string): McpStatusView {
  const want = new URLSearchParams(window.location.search).get('mcp') ?? 'connected'
  const now = Date.now()
  const at = (msAgo: number) => new Date(now - msAgo).toISOString()
  const base: McpStatusView = {
    checkoutPath: root,
    observedAt: at(0),
    unobservable: null,
    runtimeAvailable: true,
    live: [],
    stale: [],
  }

  if (want === 'none') return base
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

const PROJECT: ProjectView = {
  name: 'Knightbook',
  problems: UNREADABLE,
  checkoutPath: String.raw`C:\Users\Denny\Projects\knightbook-demo`,
  nextTicketId: 'board',
  nextExplanation: '',
  backlogOrderProblems: { duplicates: [], unknown: [] },
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

/** Lets a browser session see which host operations actually fired. */
function record(name: string, ...args: unknown[]): void {
  const log = ((window as unknown as { __calls?: unknown[] }).__calls ??= [])
  log.push([name, ...args])
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
  readTicket: async (_root, id) => {
    record('readTicket', id)
    return stubTicketDetail(PROJECT, id)
  },
  reorderBacklog: async (_root, ticketIds) => {
    record('reorderBacklog', ticketIds)
    return { ok: true, value: PROJECT }
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

  mcpLaunchCommand: async (root) => ({
    command: String.raw`C:\Program Files\Knightbook\resources\mcp\node.exe`,
    args: [String.raw`C:\Program Files\Knightbook\resources\mcp\server.mjs`, '--root', root],
  }),

  /** Add ?mcp=running|none|stale|missing|unknown to review each footer state. */
  mcpStatus: async (root) => stubMcpStatus(root),

  includeDocumentFiles: async (root) => {
    record('includeDocumentFiles', root)
    return await stubApi.listDocuments(root)
  },
  includeDocumentFolder: async (root) => {
    record('includeDocumentFolder', root)
    return await stubApi.listDocuments(root)
  },
  removeDocumentEntry: async (root, entry) => {
    record('removeDocumentEntry', entry)
    return await stubApi.listDocuments(root)
  },
  listDocuments: async () => ({
    ok: true,
    value: {
      documents: [
        {
          path: 'README.md',
          title: 'README',
          includedVia: 'README.md',
          review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
        },
        {
          path: 'docs/architecture.md',
          title: 'architecture',
          includedVia: 'docs',
          review: {
            state: 'reviewed',
            lastReviewedAt: '2026-09-18T09:00:00Z',
            changeSummary: null,
          },
        },
      ],
      problems: [{ path: 'docs/moved-away.md', reason: 'missing' }],
    },
  }),
  readDocument: async (_root, path) => ({
    ok: true,
    value: {
      path,
      content: SAMPLE_DOCUMENT,
      revision: 'rev-doc',
      review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
    },
  }),
  reviewDocument: async (_root, path) => ({
    ok: true,
    value: {
      path,
      content: SAMPLE_DOCUMENT,
      revision: 'rev-doc',
      review: { state: 'reviewed', lastReviewedAt: '2026-09-19T12:00:00Z', changeSummary: null },
    },
  }),
  openDocumentExternally: async () => ({ ok: true, value: null }),
  openExternalLink: async () => ({ ok: true, value: null }),
}
