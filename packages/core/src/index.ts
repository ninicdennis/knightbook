export { ProjectError, isProjectError, type ProjectErrorCode } from './records/errors.js'
export {
  RESERVED_DIR,
  reservedPaths,
  resolveInRoot,
  resolveProjectRoot,
  toProjectRelative,
  type ProjectRoot,
} from './records/paths.js'
export { revisionOf, type Revision } from './records/revision.js'
export {
  parseRecord,
  serializeRecord,
  SUPPORTED_SCHEMA_VERSION,
  type ParsedRecord,
} from './records/frontmatter.js'
export { readRecord, writeRecord, type ReadResult, type WriteResult } from './records/write.js'
export {
  initializeProject,
  openProject,
  projectExists,
  setBacklogOrder,
  type Project,
} from './records/project.js'
export {
  backlogOrderReport,
  inspectBacklogOrder,
  reorderBacklog,
  type BacklogOrderReport,
  type ReorderResult,
} from './tickets/backlog-order.js'
export {
  archiveTicket,
  createTicket,
  isArchived,
  listTicketRecords,
  listTickets,
  readTicket,
  restoreTicket,
  updateTicket,
  sortByBacklogOrder,
  type CreateTicketInput,
  type Ticket,
  type TicketListing,
  type TicketProblem,
  type UpdateTicketInput,
} from './tickets/tickets.js'
export {
  isUnattributedCompletion,
  recordUserCompletion,
  type RecordCompletionInput,
} from './tickets/completion.js'
export { selectNextTicket, type Candidate, type SelectionResult } from './tickets/selection.js'
export {
  createPlan,
  listPlanRecords,
  phasesContaining,
  readPlan,
  updatePlan,
  type CreatePlanInput,
  type PhaseInput,
  type PhaseMembership,
  type Plan,
  type PlanListing,
  type PlanProblem,
  type UpdatePlanInput,
} from './plans/plans.js'
export {
  planProgress,
  type PlanProgress,
  type Progress,
  type ProgressState,
} from './plans/plan-progress.js'
export {
  describeReason,
  evaluateReadiness,
  failedPrerequisites,
  type FailedPrerequisite,
  type IneligibilityReason,
  type Readiness,
} from './tickets/dependencies.js'
export {
  recordVerificationIssue,
  resolveVerificationIssue,
  type RecordVerificationIssueInput,
  type ResolveVerificationIssueInput,
} from './tickets/verification.js'
export {
  mutableStatusSchema,
  ticketStatusSchema,
  ticketTypeSchema,
  TICKET_STATUSES,
  TICKET_TYPES,
  type PlanFrontmatter,
  type PlanPhase,
  type ProjectFrontmatter,
  type TicketFrontmatter,
  type TicketStatus,
  type TicketType,
} from './records/schema.js'
export {
  includeDocuments,
  createDocument,
  listIncludedDocuments,
  readDocument,
  removeFromWorkspace,
  writeDocument,
  type CreatedDocument,
  type DocumentContent,
  type DocumentListing,
  type DocumentProblem,
  type IncludedDocument,
} from './documents/documents.js'
export {
  FOLDER_TITLE_MAX_LENGTH,
  listFolderTitles,
  setFolderTitle,
  type FolderTitle,
} from './documents/folder-titles.js'
export { searchProject, type SearchHit, type SearchResult } from './search/search.js'
export {
  DOCUMENT_SEARCH_LIMIT,
  searchDocuments,
  type DocumentSearchHit,
  type DocumentSearchResult,
} from './search/document-search.js'
export {
  searchTickets,
  TICKET_SEARCH_LIMIT,
  type Highlight,
  type SearchScope,
  type TicketSearchHit,
  type TicketSearchResult,
} from './search/ticket-search.js'
export { resolveLinkDestination, type LinkDestination } from './documents/links.js'
export {
  compareSources,
  reviewChanges,
  type ChangedLine,
  type ChangeSection,
  type ChangesState,
  type ReviewChanges,
  type SourceComparison,
} from './review/review-changes.js'
export {
  assertHumanReviewer,
  BOOKKEEPING_FIELDS,
  contentFingerprint,
  documentRecordId,
  lastReview,
  recordReview,
  reviewStatus,
  reviewedSource,
  recordTicketReview,
  ticketRecordId,
  ticketReviewStatus,
  type ReviewRecord,
  type ReviewState,
  type ReviewStatus,
} from './review/review.js'
export {
  ACCESS_REGISTRY_SCHEMA_VERSION,
  grantCheckoutAccess,
  readAccessRegistry,
  registrySessionsDir,
  revokeCheckoutAccess,
  type AccessEntry,
  type AccessRegistry,
  type GrantInput,
} from './mcp/access-registry.js'
export {
  describeEnabledCheckouts,
  findEnabledCheckout,
  resolveEnabledCheckout,
  type EnabledCheckout,
  type ResolvedCheckout,
} from './mcp/checkout-access.js'
export {
  clearMcpActivitySync,
  readMcpActivity,
  recordMcpActivity,
  type McpActivityRecord,
} from './mcp/mcp-activity.js'
export {
  readMcpSessions,
  readSharedMcpSessions,
  startMcpSession,
  startSharedMcpSession,
  SESSION_HEARTBEAT_MS,
  SESSION_STALE_MS,
  type McpSessionHandle,
  type McpSessionReading,
  type McpSessionRecord,
} from './mcp/mcp-sessions.js'
