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
  type IneligibilityReason,
  type Readiness,
} from './dependencies.js'
export {
  mutableStatusSchema,
  ticketStatusSchema,
  TICKET_STATUSES,
  type ProjectFrontmatter,
  type TicketFrontmatter,
  type TicketStatus,
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
  readMcpSessions,
  startMcpSession,
  SESSION_HEARTBEAT_MS,
  SESSION_STALE_MS,
  type McpSessionHandle,
  type McpSessionReading,
  type McpSessionRecord,
} from './mcp-sessions.js'
