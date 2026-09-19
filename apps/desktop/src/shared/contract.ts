/**
 * The data shapes that cross the preload bridge. Shared by the main process and
 * the renderer so a change to one side cannot silently desynchronize the other.
 */

export type TicketStatus = 'backlog' | 'in_progress' | 'verification' | 'done'

/** The statuses a user may move a card into directly. Done is not one of them. */
export type MovableStatus = Exclude<TicketStatus, 'done'>

export interface CompletionView {
  decisionSource: 'direct_user_action' | 'reported_user_instruction'
  recordedBy: 'user' | 'agent'
  recordedAt: string
  instruction: string
}

export type ReviewState = 'unreviewed' | 'reviewed' | 'changed_since_review'

export interface ReviewView {
  state: ReviewState
  lastReviewedAt: string | null
  /** Present only when review is stale; says what the comparison established. */
  changeSummary: string | null
}

export interface TicketView {
  id: string
  title: string
  status: TicketStatus
  revision: string
  dependsOn: string[]
  dependencyReady: boolean
  dependencyNotes: string[]
  blocker: string | null
  completion: CompletionView | null
  /** Done with no recorded decision: changed outside the app, shown as-is. */
  completionUnattributed: boolean
  review: ReviewView
}

export interface DependencyView {
  id: string
  /** Null when the referenced ticket does not exist in this project. */
  title: string | null
  status: TicketStatus | null
  /** Verification or Done satisfies a dependency (D-014). */
  satisfied: boolean
}

export interface TicketDetailView extends TicketView {
  body: string
  createdAt: string
  updatedAt: string
  relatedDocuments: string[]
  dependencies: DependencyView[]
}

export interface ProjectView {
  name: string
  checkoutPath: string
  tickets: TicketView[]
  nextTicketId: string | null
  nextExplanation: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; currentRevision?: string }

export interface ChosenFolder {
  path: string
  initialized: boolean
}

export interface McpLaunchCommand {
  command: string
  args: string[]
}

export interface ProjectspaceApi extends DocumentsApi {
  recentProjects(): Promise<string[]>
  chooseProject(): Promise<ChosenFolder | null>
  readProject(rootPath: string): Promise<Result<ProjectView>>
  setTicketStatus(
    rootPath: string,
    id: string,
    status: MovableStatus,
    revision: string,
  ): Promise<Result<ProjectView>>
  completeTicket(rootPath: string, id: string, revision: string): Promise<Result<ProjectView>>
  /** Records the user's own review. There is no agent equivalent (D-003). */
  recordTicketReview(rootPath: string, id: string, note: string): Promise<Result<ProjectView>>
  /** Everything written on one ticket, for the detail view. */
  readTicket(rootPath: string, id: string): Promise<Result<TicketDetailView>>
  mcpLaunchCommand(rootPath: string): Promise<McpLaunchCommand | null>
}

export interface DocumentSummary {
  path: string
  title: string
  /** The manifest entry this came from: the file itself, or a folder above it. */
  includedVia: string
  review: ReviewView
}

export interface DocumentProblem {
  path: string
  reason: 'missing' | 'not_readable'
}

export interface DocumentListView {
  documents: DocumentSummary[]
  /** Manifest entries that no longer resolve. Reported, never hidden. */
  problems: DocumentProblem[]
}

export interface DocumentReadView {
  path: string
  content: string
  revision: string
  review: ReviewView
}

export interface DocumentsApi {
  listDocuments(rootPath: string): Promise<Result<DocumentListView>>
  readDocument(rootPath: string, path: string): Promise<Result<DocumentReadView>>
  /** Records the user's own review of a document. No agent equivalent (D-003). */
  reviewDocument(rootPath: string, path: string): Promise<Result<DocumentReadView>>
  /** Hands the file to the user's registered editor. */
  openDocumentExternally(rootPath: string, path: string): Promise<Result<null>>
  /** Opens an http(s) link from a document, on an explicit user click. */
  openExternalLink(url: string): Promise<Result<null>>
}
