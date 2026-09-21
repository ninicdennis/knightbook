import { z } from 'zod'

/**
 * One shared validation library across the UI host and the MCP entry points, as
 * technical design section 2 requires, so the two cannot drift into accepting
 * different data.
 */

export const TICKET_STATUSES = ['backlog', 'in_progress', 'verification', 'done'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const ticketStatusSchema = z.enum(TICKET_STATUSES)

/**
 * Statuses a generic update may set. `done` is deliberately absent: section 6
 * requires completion to go through its own operation carrying the user's
 * explicit instruction, and a generic mutation must not be able to bypass it.
 */
export const mutableStatusSchema = z.enum(['backlog', 'in_progress', 'verification'])

/**
 * What kind of work a ticket is, independent of where it sits on the board. The
 * vocabulary is borrowed lightly from GitHub's default issue types, and Feature
 * and Bug read like Conventional Commits' `feat` and `fix`. It stops there: a
 * breaking change can belong to any of the three, so a type never implies a
 * version increment, and nothing derives one from it.
 *
 * The stable word is what the file stores. Any emoji belongs to presentation.
 */
export const TICKET_TYPES = ['feature', 'bug', 'task'] as const
export type TicketType = (typeof TICKET_TYPES)[number]

export const ticketTypeSchema = z.enum(TICKET_TYPES)

export const uuidSchema = z.uuid()

/**
 * One recorded acceptance. Section 6: the decision's source is recorded
 * separately from whoever wrote the file, so an agent-recorded completion
 * cannot present itself as a direct user action in the app.
 *
 * The same shape describes a current acceptance and a reopened one, so that a
 * reopened record loses none of what was known when the decision was made.
 */
export const completionSchema = z.object({
  decision_source: z.enum(['direct_user_action', 'reported_user_instruction']),
  recorded_by: z.enum(['user', 'agent']),
  recorded_at: z.iso.datetime(),
  /** Brief description of the instruction, not a stored conversation. */
  instruction: z.string().min(1).max(500),
  /** The ticket revision the completion decision was made against. */
  accepted_revision: z.string(),
})

export type TicketCompletion = z.infer<typeof completionSchema>

export const ticketFrontmatterSchema = z.object({
  schema_version: z.int().positive(),
  id: uuidSchema,
  title: z.string().min(1),
  status: ticketStatusSchema,
  /**
   * Optional, and left absent rather than defaulted: a ticket written before
   * types existed has no type, and guessing one for it would be inventing a
   * classification nobody made.
   */
  type: ticketTypeSchema.optional(),
  depends_on: z.array(uuidSchema).default([]),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  related_documents: z.array(z.string()).default([]),
  blocker: z.string().optional(),
  /**
   * Section 5 and decision D-017: a prerequisite that failed verification keeps
   * the failure on its own record. Dependent tickets are flagged from this; they
   * never store a copy, and their own statuses are left alone.
   */
  verification_issue: z
    .object({
      /** Why the work was not accepted, in the reporter's words. */
      reason: z.string().min(1).max(500),
      /** As in `completion`: the decision's source, separate from the writer. */
      decision_source: z.enum(['direct_user_action', 'reported_user_instruction']),
      recorded_by: z.enum(['user', 'agent']),
      recorded_at: z.iso.datetime(),
    })
    .optional(),
  completion: completionSchema.optional(),
  /**
   * Acceptances that were later reopened, oldest first. Moving a ticket out of
   * Done takes back what `completion` claims about where the work stands, but
   * the user did accept it once, and deleting that would leave the record
   * saying the acceptance never happened. It is history, not a current state:
   * nothing reads it to decide readiness, selection, or review.
   */
  previous_completions: z
    .array(
      completionSchema.extend({
        reopened_at: z.iso.datetime(),
        /** The status the ticket was moved to, which is why the acceptance lapsed. */
        reopened_to: mutableStatusSchema,
      }),
    )
    .optional(),
})

export type TicketFrontmatter = z.infer<typeof ticketFrontmatterSchema>

export const projectFrontmatterSchema = z.object({
  schema_version: z.int().positive(),
  id: uuidSchema,
  name: z.string().min(1),
  documents_include: z.array(z.string()).default([]),
  backlog_order: z.array(uuidSchema).default([]),
})

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>
