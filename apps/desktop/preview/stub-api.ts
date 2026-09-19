import type {
  ProjectView,
  ProjectspaceApi,
  RememberedProject,
  TicketView,
} from '../src/shared/contract.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'
import { stubTicketDetail } from './ticket-detail-stub.js'

/**
 * A stand-in host for the design preview. It serves the same shapes the real
 * IPC bridge returns, so the preview exercises the actual components rather than
 * a mock-up of them.
 */

function ticket(partial: Partial<TicketView> & Pick<TicketView, 'id' | 'title' | 'status'>): TicketView {
  return {
    revision: `rev-${partial.id}`,
    dependsOn: [],
    dependencyReady: true,
    dependencyNotes: [],
    blocker: null,
    completion: null,
    completionUnattributed: false,
    review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
    ...partial,
  }
}

const PROJECT: ProjectView = {
  name: 'Projectspace',
  checkoutPath: String.raw`C:\Users\Denny\Projects\projectspace-demo`,
  nextTicketId: 'board',
  nextExplanation: '',
  tickets: [
    ticket({
      id: 'board',
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
      title: 'Evaluate the formatted editor',
      status: 'in_progress',
      blocker: 'Milkdown 7.22.1 drops inline HTML; waiting on the upstream release.',
    }),
    ticket({
      id: 'writes',
      title: 'Implement the safe write path',
      status: 'verification',
      review: {
        state: 'changed_since_review',
        lastReviewedAt: '2026-09-18T14:00:00Z',
        changeSummary:
          'The content changed in a way that is not only formatting or status. ' +
          'Whether the meaning changed has not been determined.',
      },
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
      title: 'Edited outside the app',
      status: 'done',
      completionUnattributed: true,
    }),
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

export const stubApi: ProjectspaceApi = {
  rememberedProjects: async () => REMEMBERED,
  forgetProject: async (path) => {
    record('forgetProject', path)
    return REMEMBERED.filter((project) => project.path !== path)
  },
  chooseProject: async () => ({ path: PROJECT.checkoutPath, initialized: true }),
  readProject: async () => {
    record('readProject')
    return { ok: true, value: PROJECT }
  },
  setTicketStatus: async (_root, id, status) => {
    record('setTicketStatus', id, status)
    return { ok: true, value: PROJECT }
  },
  completeTicket: async (_root, id) => {
    record('completeTicket', id)
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
  mcpLaunchCommand: async (root) => ({
    command: String.raw`C:\Program Files\Projectspace\resources\mcp\node.exe`,
    args: [String.raw`C:\Program Files\Projectspace\resources\mcp\server.mjs`, '--root', root],
  }),

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
          review: { state: 'reviewed', lastReviewedAt: '2026-09-18T09:00:00Z', changeSummary: null },
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
