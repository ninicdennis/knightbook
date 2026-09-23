import {
  backlogOrderReport,
  createTicket,
  initializeProject,
  isArchived,
  listTicketRecords,
  projectExists,
  readTicket,
  reorderBacklog,
  resolveProjectRoot,
  selectNextTicket,
  ticketTypeSchema,
  updateTicket,
  type Project,
} from '@knightbook/core'
import { z } from 'zod'
import { guard, ok, type ToolResult } from './result.js'
import type { ProjectScope } from './scope.js'
import { registerTicketDecisionTools } from './ticket-decision-tools.js'
import { indexTickets, summarize } from './ticket-summary.js'
import type { McpServer } from '@modelcontextprotocol/server'

/**
 * The initial MCP surface from technical design section 9. Every operation reads
 * current project state, so a change made while the desktop window is closed is
 * simply the state the next read returns.
 *
 * Managed metadata is changed through these validated operations rather than
 * unrestricted whole-file writes, which is what keeps a generic mutation from
 * bypassing the completion rule in section 6.
 */

export function registerTools(server: McpServer, scope: ProjectScope): void {
  const echo = (project: Project, input: object, value: object): ToolResult =>
    ok(scope.echo(project, input, value))

  server.registerTool(
    'project_get',
    {
      title: 'Get project',
      description:
        'Identity and a compact index of the project: the one bound to this connection, ' +
        'or the one checkout_id names. Always report the project name and checkout path ' +
        'back to the user.',
      inputSchema: z.object({ ...scope.shape }),
    },
    async (input) =>
      await guard(async () => {
        if (scope.boundRoot !== null) {
          const root = await resolveProjectRoot(scope.boundRoot)
          if (!(await projectExists(root))) {
            return ok({ initialized: false, checkout_path: root.path })
          }
        }
        const project = await scope.open(input)
        const { tickets, problems } = await listTicketRecords(project)
        /*
         * The counts describe the working board, so archived tickets are not
         * added to the four statuses; they are reported on their own line.
         * Folding them in would make a column look busier than it is, and
         * leaving them out silently would make tickets look lost.
         */
        const byStatus = { backlog: 0, in_progress: 0, verification: 0, done: 0 }
        let archivedCount = 0
        for (const t of tickets) {
          if (isArchived(t)) archivedCount += 1
          else byStatus[t.frontmatter.status] += 1
        }

        const order = await backlogOrderReport(project)
        return echo(project, input, {
          initialized: true,
          id: project.frontmatter.id,
          name: project.frontmatter.name,
          checkout_path: project.root.path,
          documents_include: project.frontmatter.documents_include,
          ticket_counts: byStatus,
          /** Off the working board, still on disk. Not part of the four counts above. */
          archived_ticket_count: archivedCount,
          // Counts cover only tickets that loaded; unreadable files are listed, never dropped.
          ticket_problems: problems,
          /**
           * Section 5: duplicate or unknown order entries are reported, never
           * deleted. An empty list here means the manifest's order is sound.
           */
          backlog_order_problems: {
            duplicates: order.duplicates,
            unknown: order.unknown,
          },
        })
      }),
  )

  /**
   * Only a root-bound connection can create a project, and only in the folder it
   * was launched for. A shared connection reaches folders the user enabled in the
   * app, which already hold projects; offering creation there would let a tool
   * call decide where a new project goes, so setup stays in the app.
   */
  const boundRoot = scope.boundRoot
  if (boundRoot !== null) {
    server.registerTool(
      'project_initialize',
      {
        title: 'Initialize project',
        description:
          'Create project records in the folder bound to this connection. Existing ' +
          'files are preserved; this only adds the reserved folder when it is absent.',
        inputSchema: z.object({ name: z.string().min(1).optional() }),
      },
      async ({ name }) =>
        await guard(async () => {
          const project = await initializeProject(boundRoot, name ? { name } : {})
          return ok({
            id: project.frontmatter.id,
            name: project.frontmatter.name,
            checkout_path: project.root.path,
          })
        }),
    )
  }

  server.registerTool(
    'ticket_list',
    {
      title: 'List tickets',
      description:
        'Tickets in backlog order with dependency readiness, plus any ticket files that ' +
        'could not be read (problems). A prerequisite in Verification or Done satisfies a ' +
        'dependency; that does not mean it is accepted. Report problems to the user; do ' +
        'not try to repair those files unless asked. ' +
        'Archived tickets are left out by default, because the default view is the working ' +
        'board: pass archived "only" to browse them or "all" to see both. An archived ' +
        'ticket keeps its status and stays readable by id through ticket_read either way.',
      inputSchema: z.object({
        ...scope.shape,
        status: z.enum(['backlog', 'in_progress', 'verification', 'done']).optional(),
        archived: z.enum(['exclude', 'only', 'all']).optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const index = await indexTickets(project)
        const archived = input.archived ?? 'exclude'
        const filtered = index.tickets.filter((t) => {
          if (input.status && t.frontmatter.status !== input.status) return false
          if (archived === 'all') return true
          return archived === 'only' ? isArchived(t) : !isArchived(t)
        })
        return echo(project, input, {
          tickets: filtered.map((t) => summarize(t, index)),
          problems: index.problems,
        })
      }),
  )

  server.registerTool(
    'ticket_next',
    {
      title: 'Next eligible ticket',
      description:
        'The first Backlog ticket in order whose prerequisites are all in Verification ' +
        'or Done. This selects a candidate; it does not start or reserve it.',
      inputSchema: z.object({ ...scope.shape }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const result = await selectNextTicket(project)
        if (!result.next) {
          return echo(project, input, {
            next: null,
            explanation: result.explanation,
            problems: result.problems,
          })
        }
        const index = await indexTickets(project)
        return echo(project, input, {
          next: summarize(result.next, index),
          body: result.next.body,
          problems: result.problems,
        })
      }),
  )

  server.registerTool(
    'ticket_read',
    {
      title: 'Read ticket',
      description: 'Full ticket content plus its revision, needed for any later write.',
      inputSchema: z.object({ ...scope.shape, id: z.uuid() }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await readTicket(project, input.id)
        return echo(project, input, {
          ...summarize(ticket, await indexTickets(project)),
          body: ticket.body,
        })
      }),
  )

  server.registerTool(
    'ticket_create',
    {
      title: 'Create ticket',
      description: 'Create a Backlog ticket. New tickets always start in Backlog.',
      inputSchema: z.object({
        ...scope.shape,
        title: z.string().min(1),
        body: z.string().optional(),
        depends_on: z.array(z.uuid()).optional(),
        related_documents: z.array(z.string()).optional(),
        type: ticketTypeSchema
          .optional()
          .describe(
            'What kind of work this is: feature (new capability), bug (incorrect ' +
              'behaviour), or task (maintenance, research, documentation). Leave it ' +
              'out when the user has not said; untyped is a valid state.',
          ),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await createTicket(project, {
          title: input.title,
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.depends_on !== undefined ? { dependsOn: input.depends_on } : {}),
          ...(input.related_documents !== undefined
            ? { relatedDocuments: input.related_documents }
            : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
        })
        return echo(project, input, { id: ticket.frontmatter.id, revision: ticket.revision })
      }),
  )

  server.registerTool(
    'ticket_update',
    {
      title: 'Update ticket',
      description:
        'Update ticket content and ordinary lifecycle fields. This cannot set Done: ' +
        'completion is the user decision and goes through ticket_record_user_completion. ' +
        'Leave implemented work in Verification.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        expected_revision: z.string(),
        title: z.string().min(1).optional(),
        status: z.enum(['backlog', 'in_progress', 'verification']).optional(),
        body: z.string().optional(),
        depends_on: z.array(z.uuid()).optional(),
        related_documents: z
          .array(z.string())
          .optional()
          .describe(
            'Project-relative paths of the documents this ticket points at. Replaces the ' +
              'whole list; omit to keep it, send [] to clear it.',
          ),
        blocker: z.string().nullable().optional(),
        type: ticketTypeSchema
          .nullable()
          .optional()
          .describe('Omit to keep the current type. Send null to clear it back to untyped.'),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await updateTicket(project, input.id, {
          expectedRevision: input.expected_revision,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.depends_on !== undefined ? { dependsOn: input.depends_on } : {}),
          ...(input.related_documents !== undefined
            ? { relatedDocuments: input.related_documents }
            : {}),
          ...(input.blocker !== undefined ? { blocker: input.blocker } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
        })
        return echo(project, input, {
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          type: ticket.frontmatter.type ?? null,
          revision: ticket.revision,
        })
      }),
  )

  server.registerTool(
    'ticket_reorder_backlog',
    {
      title: 'Reorder the backlog',
      description:
        'Set the manual backlog order, which is what ticket_next follows. The ids ' +
        'given are placed in that order at the front; entries already in the ' +
        'manifest that you do not mention keep their relative order behind them, ' +
        'so nothing is dropped. This edits only the order in the project manifest ' +
        'and changes no ticket. Ask the user what order they want; do not reprioritize ' +
        'their board on your own reading of it.',
      inputSchema: z.object({
        ...scope.shape,
        ticket_ids: z
          .array(z.uuid())
          .min(1)
          .describe('Tickets in the order they should appear, first to last.'),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const { order, report } = await reorderBacklog(project, input.ticket_ids)
        return echo(project, input, {
          backlog_order: order,
          // Reported, never removed: a duplicate or an id with no ticket is left
          // in place for the user to resolve deliberately.
          backlog_order_problems: { duplicates: report.duplicates, unknown: report.unknown },
        })
      }),
  )

  registerTicketDecisionTools(server, scope)
}
