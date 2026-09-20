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

/**
 * D-017: a verification that the user did not accept, kept on the ticket that
 * failed. Its provenance is recorded the same way completion's is, so an
 * AI-reported failure never presents itself as a direct user action.
 */
export interface VerificationIssueView {
  reason: string
  decisionSource: 'direct_user_action' | 'reported_user_instruction'
  recordedBy: 'user' | 'agent'
  recordedAt: string
}

/** A prerequisite whose failed verification this ticket's work rests on. */
export interface AffectedByView {
  ticketId: string
  title: string
  issue: string
  /** False when the failure is further up the chain than this ticket's own prerequisites. */
  direct: boolean
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
  /** This ticket's own failed verification, or null. */
  verificationIssue: VerificationIssueView | null
  /**
   * Prerequisites that failed verification, derived on every read. A non-empty
   * list means this is affected work: its status was left alone, and what to
   * rework is the user's decision.
   */
  affectedBy: AffectedByView[]
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
  /** True when the file exists but could not be read, which is not the same as missing. */
  unreadable: boolean
}

export interface TicketDetailView extends TicketView {
  body: string
  createdAt: string
  updatedAt: string
  relatedDocuments: string[]
  dependencies: DependencyView[]
}

/** Where a match sits in a string, so the view can mark it up without building markup. */
export interface SearchHighlight {
  start: number
  length: number
}

export interface TicketSearchHitView {
  id: string
  title: string
  status: TicketStatus
  /** Empty when only the body matched. */
  titleHighlights: SearchHighlight[]
  /** Context around the first body match, or null when only the title matched. */
  excerpt: string | null
  /** Offsets within `excerpt`, not within the ticket body. */
  excerptHighlights: SearchHighlight[]
}

export interface TicketSearchView {
  /**
   * The checkout and query this answers. Both are echoed back so a reply that
   * arrives after the user typed on, or switched project, can be discarded
   * rather than shown against the wrong question.
   */
  checkoutPath: string
  query: string
  hits: TicketSearchHitView[]
  /** Every matching ticket, including any beyond the returned hits. */
  totalMatches: number
  /** Ticket files that could not be read, so they could not be searched. */
  unsearchable: RecordProblemView[]
}

/** A record file the app could not use. It is listed, never repaired or rewritten. */
export interface RecordProblemView {
  /** Project-relative path. */
  file: string
  reason: string
}

export interface ProjectView {
  name: string
  checkoutPath: string
  tickets: TicketView[]
  problems: RecordProblemView[]
  nextTicketId: string | null
  nextExplanation: string
  /**
   * Manual-order entries that do not make sense: a ticket listed twice, or an
   * id with no ticket. Reported and never removed, so the user decides.
   */
  backlogOrderProblems: { duplicates: string[]; unknown: string[] }
}

export type Result<T> =
  { ok: true; value: T } | { ok: false; code: string; message: string; currentRevision?: string }

export interface ChosenFolder {
  path: string
  initialized: boolean
}

export interface RememberedProject {
  path: string
  name: string
  /** Why it cannot be opened right now, or null when it can. */
  unavailable: string | null
}

export interface FolderInspection {
  /** The folder's own name, offered as the default project name. */
  name: string
  /** Existing documents worth offering to include, as project-relative paths. */
  suggestions: string[]
}

export interface SetupOutcome {
  path: string
  /** Set when the project exists but something asked for could not be done. */
  warning: string | null
}

export interface McpLaunchCommand {
  command: string
  args: string[]
}

/** One MCP server process that recorded itself against this project. */
export interface McpSessionView {
  pid: number
  startedAt: string
  /** When a client completed an opening handshake, or null if none has. */
  connectedAt: string | null
  lastSeenAt: string
}

/**
 * What the app could actually observe about MCP for one checkout. These are
 * three separate facts and the UI must not collapse them: the bundled runtime
 * existing says nothing about a server running, and a server running says
 * nothing about a client having connected to it.
 */
export interface McpStatusView {
  /** The checkout this describes, so a reply that arrives late can be discarded. */
  checkoutPath: string
  observedAt: string
  /** Set when nothing could be observed. Not the same as observing nothing. */
  unobservable: string | null
  /** Whether the bundled server the copied configuration points at is present. */
  runtimeAvailable: boolean
  /** Sessions whose heartbeat is current. */
  live: McpSessionView[]
  /** Sessions left behind by a process that stopped without cleaning up. */
  stale: McpSessionView[]
}

/** How the window picks its appearance. `auto` follows the operating system. */
export type ColorSchemeChoice = 'light' | 'dark' | 'auto'

/**
 * Preferences for this installation. Technical design section 3 calls these
 * disposable app state, so they live beside the remembered project list rather
 * than in any project's files: a clone opened on another machine keeps its own.
 */
export interface AppSettings {
  colorScheme: ColorSchemeChoice
}

export interface ProjectspaceApi extends DocumentsApi {
  /** Projects this machine has opened, most recent first, each checked for availability. */
  rememberedProjects(): Promise<RememberedProject[]>
  /** Forgets one entry and returns the updated list. Deletes nothing on disk. */
  forgetProject(path: string): Promise<RememberedProject[]>
  chooseProject(): Promise<ChosenFolder | null>
  /** What is in a folder the user just chose that has no project yet. */
  inspectFolder(path: string): Promise<Result<FolderInspection>>
  /** Creates project records in that folder, and includes the named documents in place. */
  setUpFolder(path: string, name: string, include: string[]): Promise<Result<SetupOutcome>>
  readProject(rootPath: string): Promise<Result<ProjectView>>
  setTicketStatus(
    rootPath: string,
    id: string,
    status: MovableStatus,
    revision: string,
  ): Promise<Result<ProjectView>>
  completeTicket(rootPath: string, id: string, revision: string): Promise<Result<ProjectView>>
  /**
   * Records that the user did not accept a ticket in Verification (D-017). It
   * flags dependent work and changes no status, here or downstream.
   */
  recordVerificationIssue(
    rootPath: string,
    id: string,
    revision: string,
    reason: string,
  ): Promise<Result<ProjectView>>
  /** Clears that issue once the user settles it, un-flagging every dependent. */
  resolveVerificationIssue(
    rootPath: string,
    id: string,
    revision: string,
  ): Promise<Result<ProjectView>>
  /** Records the user's own review. There is no agent equivalent (D-003). */
  recordTicketReview(rootPath: string, id: string, note: string): Promise<Result<ProjectView>>
  /** Everything written on one ticket, for the detail view. */
  readTicket(rootPath: string, id: string): Promise<Result<TicketDetailView>>
  /** Bounded text search over ticket titles and bodies in one checkout. */
  searchTickets(rootPath: string, query: string): Promise<Result<TicketSearchView>>
  /**
   * Sets the manual backlog order, which is what "next up" follows. This edits
   * only the order in the project manifest and changes no ticket.
   */
  reorderBacklog(rootPath: string, ticketIds: string[]): Promise<Result<ProjectView>>
  mcpLaunchCommand(rootPath: string): Promise<McpLaunchCommand | null>
  /** Observes MCP status for one checkout. Reads only; it never writes to the project. */
  mcpStatus(rootPath: string): Promise<McpStatusView>
  /** This installation's preferences. Missing or unreadable state reads as the defaults. */
  readSettings(): Promise<AppSettings>
  /** Merges the given fields into the stored settings and returns the stored result. */
  saveSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings>>
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
  /**
   * Opens a picker for Markdown files inside the project and includes them
   * where they are (D-011). Nothing is copied or moved. Cancelling returns the
   * list unchanged.
   *
   * Files and folders are separate actions because Windows and Linux cannot show
   * one dialog that selects both.
   */
  includeDocumentFiles(rootPath: string): Promise<Result<DocumentListView>>
  includeDocumentFolder(rootPath: string): Promise<Result<DocumentListView>>
  /** Drops one manifest entry. The file or folder itself is left on disk. */
  removeDocumentEntry(rootPath: string, entry: string): Promise<Result<DocumentListView>>
  readDocument(rootPath: string, path: string): Promise<Result<DocumentReadView>>
  /** Records the user's own review of a document. No agent equivalent (D-003). */
  reviewDocument(rootPath: string, path: string): Promise<Result<DocumentReadView>>
  /** Hands the file to the user's registered editor. */
  openDocumentExternally(rootPath: string, path: string): Promise<Result<null>>
  /** Opens an http(s) link from a document, on an explicit user click. */
  openExternalLink(url: string): Promise<Result<null>>
}
