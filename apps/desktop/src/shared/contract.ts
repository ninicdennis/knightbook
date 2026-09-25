/**
 * The data shapes that cross the preload bridge. Shared by the main process and
 * the renderer so a change to one side cannot silently desynchronize the other.
 */

// The MCP status and access types live in their own module; re-exported so
// every existing import from this file keeps working.
export type {
  McpAccessView,
  McpLaunchCommand,
  McpSessionView,
  McpStatusView,
} from './mcp-contract.js'
import type { McpAccessView, McpLaunchCommand, McpStatusView } from './mcp-contract.js'
// Review state and the changes-since-review comparison, re-exported the same way.
export type {
  ChangedLineView,
  ChangeSectionView,
  ReviewChangesView,
  ReviewState,
  ReviewView,
} from './review-contract.js'
import type { ReviewChangesApi, ReviewView } from './review-contract.js'
// The documents types and operations, re-exported the same way.
export type {
  DocumentListView,
  DocumentProblem,
  DocumentReadView,
  DocumentSummary,
  DocumentsApi,
  LinkDestinationView,
} from './documents-contract.js'
import type { DocumentsApi } from './documents-contract.js'

export type TicketStatus = 'backlog' | 'in_progress' | 'verification' | 'done'

/** The statuses a user may move a card into directly. Done is not one of them. */
export type MovableStatus = Exclude<TicketStatus, 'done'>

/**
 * What kind of work a ticket is, independent of where it sits on the board.
 * Null means untyped, which is a real state and not a fourth kind of work.
 */
export type TicketType = 'feature' | 'bug' | 'task'

export interface CompletionView {
  decisionSource: 'direct_user_action' | 'reported_user_instruction'
  recordedBy: 'user' | 'agent'
  recordedAt: string
  instruction: string
}

/**
 * An acceptance that was later taken back by moving the ticket out of Done. It
 * is history: it says the decision happened, and when it stopped describing
 * where the work stands.
 */
export interface ReopenedCompletionView extends CompletionView {
  reopenedAt: string
  reopenedTo: 'backlog' | 'in_progress' | 'verification'
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

export interface TicketView {
  id: string
  title: string
  status: TicketStatus
  type: TicketType | null
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
  /**
   * When this ticket was archived, or null when it is on the board. `status`
   * above stays its real status while archived, and is what restoring returns
   * it to, so the retained status cannot drift from the actual one.
   */
  archivedAt: string | null
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
  /** Oldest first. Empty for a ticket that was never accepted and reopened. */
  previousCompletions: ReopenedCompletionView[]
}

/**
 * Which tickets a search looks at. Archived work stays findable, because keeping
 * the record is the point of archiving; it is just not what someone searching
 * the board usually means, so the scope is theirs to choose.
 */
export type SearchScope = 'active' | 'archived' | 'all'

/** Where a match sits in a string, so the view can mark it up without building markup. */
export interface SearchHighlight {
  start: number
  length: number
}

export interface TicketSearchHitView {
  id: string
  title: string
  status: TicketStatus
  type: TicketType | null
  /** Empty when only the body matched. */
  titleHighlights: SearchHighlight[]
  /** Context around the first body match, or null when only the title matched. */
  excerpt: string | null
  /** Offsets within `excerpt`, not within the ticket body. */
  excerptHighlights: SearchHighlight[]
  /** When it was archived, or null. Archived hits are labelled, never hidden. */
  archivedAt: string | null
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
  /**
   * The working board. Archived tickets are not here: every consumer of this
   * list draws columns, counts, and the next-up suggestion from it, and each
   * one would otherwise have to remember to exclude them.
   */
  tickets: TicketView[]
  /** Off the board and still on disk, most recently archived first. */
  archivedTickets: TicketView[]
  problems: RecordProblemView[]
  nextTicketId: string | null
  nextExplanation: string
  /**
   * Manual-order entries that do not make sense: a ticket listed twice, or an
   * id with no ticket. Reported and never removed, so the user decides.
   */
  backlogOrderProblems: { duplicates: string[]; unknown: string[] }
}

/** One ticket to archive, at the revision the user was shown. */
export interface ArchiveTarget {
  id: string
  revision: string
}

/** One ticket a bulk archive could not take, and why, in the user's terms. */
export interface ArchiveFailureView {
  id: string
  title: string
  reason: string
}

/**
 * What a bulk archive actually did. Partial success is a real outcome here
 * rather than an error: each ticket is its own file and its own write, so some
 * can succeed while another was changed underneath the user. The ones that
 * succeeded stay archived, and the rest are named so they can be retried.
 */
export interface ArchiveOutcome {
  archivedCount: number
  failures: ArchiveFailureView[]
  project: ProjectView
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

/** The project a window title names, as the loaded project record gives it. */
export interface WindowTitleProject {
  name: string
  checkoutPath: string
}

export interface KnightbookApi extends DocumentsApi, ReviewChangesApi {
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
  /** Sets or clears the ticket's work type. Null clears it back to untyped. */
  setTicketType(
    rootPath: string,
    id: string,
    type: TicketType | null,
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
  /**
   * Records the user's own review. There is no agent equivalent (D-003). With a
   * revision, a ticket that changed since the user was shown it is refused.
   */
  recordTicketReview(
    rootPath: string,
    id: string,
    note: string,
    revision?: string,
  ): Promise<Result<ProjectView>>
  /**
   * Takes tickets off the board, keeping their files and everything on them.
   * Archiving records nothing about whether work was finished or accepted.
   *
   * Takes the exact tickets and revisions the user was looking at, so a ticket
   * created or changed after they opened the confirmation is not swept up. Each
   * one is a separate write: this is not a transaction across files, and the
   * outcome says exactly which ones did not happen and why.
   */
  archiveTickets(rootPath: string, targets: ArchiveTarget[]): Promise<Result<ArchiveOutcome>>
  /** Puts one archived ticket back in the status it kept. Never reopens Done. */
  restoreTicket(rootPath: string, id: string, revision: string): Promise<Result<ProjectView>>
  /** Everything written on one ticket, for the detail view. */
  readTicket(rootPath: string, id: string): Promise<Result<TicketDetailView>>
  /** Bounded text search over ticket titles and bodies in one checkout. */
  searchTickets(
    rootPath: string,
    query: string,
    scope: SearchScope,
  ): Promise<Result<TicketSearchView>>
  /**
   * Sets the manual backlog order, which is what "next up" follows. This edits
   * only the order in the project manifest and changes no ticket.
   */
  reorderBacklog(rootPath: string, ticketIds: string[]): Promise<Result<ProjectView>>
  /**
   * The one shared configuration for every project the user enables. It names
   * the access list, not a project, so it never changes when projects do.
   */
  mcpLaunchCommand(): Promise<McpLaunchCommand>
  /** Turns "Allow AI access through MCP" on or off for one checkout. */
  setMcpAccess(rootPath: string, enabled: boolean): Promise<Result<McpAccessView>>
  /** Observes MCP status for one checkout. Reads only; it never writes to the project. */
  mcpStatus(rootPath: string): Promise<McpStatusView>
  /** This installation's preferences. Missing or unreadable state reads as the defaults. */
  readSettings(): Promise<AppSettings>
  /** Merges the given fields into the stored settings and returns the stored result. */
  saveSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings>>
  /** Names the open project and its checkout folder in the window title; null claims no project. */
  showProjectInWindowTitle(project: WindowTitleProject | null): Promise<void>
}
