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
import type { McpApi } from './mcp-contract.js'
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
  FolderTitleView,
  LinkDestinationView,
} from './documents-contract.js'
import type { DocumentsApi } from './documents-contract.js'
import type { PlansApi } from './plans-contract.js'
import type { SkillSetupApi } from './skill-setup-contract.js'
import type { TicketCreateApi } from './ticket-create-contract.js'
import type { TicketEditApi } from './ticket-edit-contract.js'
import type { DocumentSearchApi } from './document-search-contract.js'
import type { ArchiveApi } from './archive-contract.js'
import type { ProjectSetupApi } from './project-setup-contract.js'
import type { SettingsApi } from './settings-contract.js'
import type { TicketSearchApi } from './ticket-search-contract.js'

export type TicketStatus = 'backlog' | 'in_progress' | 'verification' | 'done'

/** The statuses a user may move a card into directly. Done is not one of them. */
export type MovableStatus = Exclude<TicketStatus, 'done'>

/**
 * What kind of work a ticket is, independent of where it sits on the board.
 * Null means untyped, which is a real state and not another kind of work.
 */
export type TicketType = 'feature' | 'bug' | 'task' | 'research' | 'documentation'

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
  /** Each plan phase that lists this ticket. Plan files that could not be read are left out. */
  plans: TicketPlanView[]
}

export interface TicketPlanView {
  planId: string
  planTitle: string
  phaseId: string
  phaseTitle: string
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

export type Result<T> =
  { ok: true; value: T } | { ok: false; code: string; message: string; currentRevision?: string }

export interface KnightbookApi
  extends
    DocumentsApi,
    ReviewChangesApi,
    SkillSetupApi,
    PlansApi,
    TicketCreateApi,
    TicketEditApi,
    DocumentSearchApi,
    TicketSearchApi,
    ArchiveApi,
    ProjectSetupApi,
    SettingsApi,
    McpApi {
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
  /** Everything written on one ticket, for the detail view. */
  readTicket(rootPath: string, id: string): Promise<Result<TicketDetailView>>
  /** Opens the ticket's own Markdown file with the system's handler. The host builds the path. */
  openTicketExternally(rootPath: string, id: string): Promise<Result<null>>
  /**
   * Sets the manual backlog order, which is what "next up" follows. This edits
   * only the order in the project manifest and changes no ticket.
   */
  reorderBacklog(rootPath: string, ticketIds: string[]): Promise<Result<ProjectView>>
}
