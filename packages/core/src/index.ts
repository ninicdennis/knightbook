export { ProjectError, isProjectError, type ProjectErrorCode } from './errors.js'
export {
  RESERVED_DIR,
  reservedPaths,
  resolveInRoot,
  resolveProjectRoot,
  toProjectRelative,
  type ProjectRoot,
} from './paths.js'
export { revisionOf, type Revision } from './revision.js'
export {
  parseRecord,
  serializeRecord,
  SUPPORTED_SCHEMA_VERSION,
  type ParsedRecord,
} from './frontmatter.js'
export { readRecord, writeRecord, type ReadResult, type WriteResult } from './write.js'
export {
  initializeProject,
  openProject,
  projectExists,
  setBacklogOrder,
  type Project,
} from './project.js'
export {
  backlogOrderReport,
  inspectBacklogOrder,
  reorderBacklog,
  type BacklogOrderReport,
  type ReorderResult,
} from './backlog-order.js'
export {
  createTicket,
  listTicketRecords,
  listTickets,
  readTicket,
  updateTicket,
  sortByBacklogOrder,
  type CreateTicketInput,
  type Ticket,
  type TicketListing,
  type TicketProblem,
  type UpdateTicketInput,
} from './tickets.js'
export {
  isUnattributedCompletion,
  recordUserCompletion,
  type RecordCompletionInput,
} from './completion.js'
export { selectNextTicket, type Candidate, type SelectionResult } from './selection.js'
export {
  describeReason,
  evaluateReadiness,
  failedPrerequisites,
  type FailedPrerequisite,
  type IneligibilityReason,
  type Readiness,
} from './dependencies.js'
export {
  recordVerificationIssue,
  resolveVerificationIssue,
  type RecordVerificationIssueInput,
  type ResolveVerificationIssueInput,
} from './verification.js'
export {
  mutableStatusSchema,
  ticketStatusSchema,
  ticketTypeSchema,
  TICKET_STATUSES,
  TICKET_TYPES,
  type ProjectFrontmatter,
  type TicketFrontmatter,
  type TicketStatus,
  type TicketType,
} from './schema.js'
export {
  includeDocuments,
  listIncludedDocuments,
  readDocument,
  removeFromWorkspace,
  writeDocument,
  type DocumentContent,
  type DocumentListing,
  type DocumentProblem,
  type IncludedDocument,
} from './documents.js'
export { searchProject, type SearchHit, type SearchResult } from './search.js'
export {
  searchTickets,
  TICKET_SEARCH_LIMIT,
  type Highlight,
  type TicketSearchHit,
  type TicketSearchResult,
} from './ticket-search.js'
export {
  assertHumanReviewer,
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
} from './review.js'
export {
  ACCESS_REGISTRY_SCHEMA_VERSION,
  grantCheckoutAccess,
  readAccessRegistry,
  registrySessionsDir,
  revokeCheckoutAccess,
  type AccessEntry,
  type AccessRegistry,
  type GrantInput,
} from './access-registry.js'
export {
  describeEnabledCheckouts,
  findEnabledCheckout,
  resolveEnabledCheckout,
  type EnabledCheckout,
  type ResolvedCheckout,
} from './checkout-access.js'
export {
  clearMcpActivitySync,
  readMcpActivity,
  recordMcpActivity,
  type McpActivityRecord,
} from './mcp-activity.js'
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
} from './mcp-sessions.js'
