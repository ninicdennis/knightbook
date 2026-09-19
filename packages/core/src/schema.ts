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

export const uuidSchema = z.uuid()

export const ticketFrontmatterSchema = z.object({
  schema_version: z.int().positive(),
  id: uuidSchema,
  title: z.string().min(1),
  status: ticketStatusSchema,
  depends_on: z.array(uuidSchema).default([]),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  related_documents: z.array(z.string()).default([]),
  blocker: z.string().optional(),
  completion: z
    .object({
      /**
       * Section 6: the decision's source is recorded separately from whoever
       * wrote the file, so an agent-recorded completion cannot present itself as
       * a direct user action in the app.
       */
      decision_source: z.enum(['direct_user_action', 'reported_user_instruction']),
      recorded_by: z.enum(['user', 'agent']),
      recorded_at: z.iso.datetime(),
      /** Brief description of the instruction, not a stored conversation. */
      instruction: z.string().min(1).max(500),
      /** The ticket revision the completion decision was made against. */
      accepted_revision: z.string(),
    })
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
