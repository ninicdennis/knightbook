import {
  createTicket,
  describeReason,
  evaluateReadiness,
  initializeProject,
  isUnattributedCompletion,
  listTicketRecords,
  openProject,
  projectExists,
  readTicket,
  recordUserCompletion,
  resolveProjectRoot,
  selectNextTicket,
  updateTicket,
  type Project,
  type Ticket,
  type TicketFrontmatter,
  type TicketProblem,
} from '@projectspace/core'
import { z } from 'zod'
import { guard, ok } from './result.js'
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

/** Every ticket that loaded, plus the files that did not, indexed for readiness checks. */
interface TicketIndex {
  readonly tickets: Ticket[]
  readonly problems: TicketProblem[]
  readonly byId: ReadonlyMap<string, TicketFrontmatter>
  readonly unreadable: ReadonlySet<string>
}

async function indexTickets(project: Project): Promise<TicketIndex> {
  const { tickets, problems } = await listTicketRecords(project)
  return {
    tickets,
    problems,
    byId: new Map(tickets.map((t) => [t.frontmatter.id, t.frontmatter])),
    unreadable: new Set(problems.map((problem) => problem.id)),
  }
}

function summarize(ticket: Ticket, index: TicketIndex) {
  const readiness = evaluateReadiness(ticket.frontmatter, index.byId, index.unreadable)
  return {
    id: ticket.frontmatter.id,
    title: ticket.frontmatter.title,
    status: ticket.frontmatter.status,
    revision: ticket.revision,
    depends_on: ticket.frontmatter.depends_on,
    dependency_ready: readiness.ready,
    dependency_notes: readiness.reasons.map(describeReason),
    /** Section 6: a Done status with no provenance is shown, not silently trusted. */
    completion: ticket.frontmatter.completion ?? null,
    completion_unattributed: isUnattributedCompletion(ticket),
  }
}

export function registerTools(server: McpServer, rootPath: string): void {
  const load = async (): Promise<Project> => await openProject(rootPath)

  server.registerTool(
    'project_get',
    {
      title: 'Get project',
      description:
        'Identity and a compact index of the project bound to this connection. ' +
        'Always report the project name and checkout path back to the user.',
      inputSchema: z.object({}),
    },
    async () =>
      await guard(async () => {
        const root = await resolveProjectRoot(rootPath)
        if (!(await projectExists(root))) {
          return ok({ initialized: false, checkout_path: root.path })
        }
        const project = await load()
        const { tickets, problems } = await listTicketRecords(project)
        const byStatus = { backlog: 0, in_progress: 0, verification: 0, done: 0 }
        for (const t of tickets) byStatus[t.frontmatter.status] += 1

        return ok({
          initialized: true,
          id: project.frontmatter.id,
          name: project.frontmatter.name,
          checkout_path: project.root.path,
          documents_include: project.frontmatter.documents_include,
          ticket_counts: byStatus,
          // Counts cover only tickets that loaded; unreadable files are listed, never dropped.
          ticket_problems: problems,
        })
      }),
  )

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
        const project = await initializeProject(rootPath, name ? { name } : {})
        return ok({
          id: project.frontmatter.id,
          name: project.frontmatter.name,
          checkout_path: project.root.path,
        })
      }),
  )

  server.registerTool(
    'ticket_list',
    {
      title: 'List tickets',
      description:
        'Tickets in backlog order with dependency readiness, plus any ticket files that ' +
        'could not be read (problems). A prerequisite in Verification or Done satisfies a ' +
        'dependency; that does not mean it is accepted. Report problems to the user; do ' +
        'not try to repair those files unless asked.',
      inputSchema: z.object({
        status: z.enum(['backlog', 'in_progress', 'verification', 'done']).optional(),
      }),
    },
    async ({ status }) =>
      await guard(async () => {
        const project = await load()
        const index = await indexTickets(project)
        const filtered = status
          ? index.tickets.filter((t) => t.frontmatter.status === status)
          : index.tickets
        return ok({ tickets: filtered.map((t) => summarize(t, index)), problems: index.problems })
      }),
  )

  server.registerTool(
    'ticket_next',
    {
      title: 'Next eligible ticket',
      description:
        'The first Backlog ticket in order whose prerequisites are all in Verification ' +
        'or Done. This selects a candidate; it does not start or reserve it.',
      inputSchema: z.object({}),
    },
    async () =>
      await guard(async () => {
        const project = await load()
        const result = await selectNextTicket(project)
        if (!result.next) {
          return ok({ next: null, explanation: result.explanation, problems: result.problems })
        }
        const index = await indexTickets(project)
        return ok({
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
      inputSchema: z.object({ id: z.uuid() }),
    },
    async ({ id }) =>
      await guard(async () => {
        const project = await load()
        const ticket = await readTicket(project, id)
        return ok({ ...summarize(ticket, await indexTickets(project)), body: ticket.body })
      }),
  )

  server.registerTool(
    'ticket_create',
    {
      title: 'Create ticket',
      description: 'Create a Backlog ticket. New tickets always start in Backlog.',
      inputSchema: z.object({
        title: z.string().min(1),
        body: z.string().optional(),
        depends_on: z.array(z.uuid()).optional(),
        related_documents: z.array(z.string()).optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await load()
        const ticket = await createTicket(project, {
          title: input.title,
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.depends_on !== undefined ? { dependsOn: input.depends_on } : {}),
          ...(input.related_documents !== undefined
            ? { relatedDocuments: input.related_documents }
            : {}),
        })
        return ok({ id: ticket.frontmatter.id, revision: ticket.revision })
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
        id: z.uuid(),
        expected_revision: z.string(),
        title: z.string().min(1).optional(),
        status: z.enum(['backlog', 'in_progress', 'verification']).optional(),
        body: z.string().optional(),
        depends_on: z.array(z.uuid()).optional(),
        blocker: z.string().nullable().optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await load()
        const ticket = await updateTicket(project, input.id, {
          expectedRevision: input.expected_revision,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.depends_on !== undefined ? { dependsOn: input.depends_on } : {}),
          ...(input.blocker !== undefined ? { blocker: input.blocker } : {}),
        })
        return ok({
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          revision: ticket.revision,
        })
      }),
  )

  server.registerTool(
    'ticket_record_user_completion',
    {
      title: 'Record user completion',
      description:
        'Record that the user explicitly said a ticket is complete. Only valid from ' +
        'Verification. Passing tests, your own review, or reaching Verification are ' +
        'not the user decision and must not be reported as one. Set ' +
        'user_instructed_completion only when the user actually told you it is done.',
      inputSchema: z.object({
        id: z.uuid(),
        expected_revision: z.string(),
        user_instructed_completion: z.boolean(),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('A brief description of what the user said, not the conversation.'),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await load()
        const ticket = await recordUserCompletion(project, input.id, {
          expectedRevision: input.expected_revision,
          recordedBy: 'agent',
          userInstructedCompletion: input.user_instructed_completion,
          instruction: input.instruction,
        })
        return ok({
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          completion: ticket.frontmatter.completion,
        })
      }),
  )
}
