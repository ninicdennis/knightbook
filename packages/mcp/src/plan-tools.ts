import {
  createPlan,
  listPlanRecords,
  listTicketRecords,
  planProgress,
  readPlan,
  updatePlan,
  type Plan,
  type Project,
  type TicketListing,
} from '@knightbook/core'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { guard, ok, type ToolResult } from './result.js'
import type { ProjectScope } from './scope.js'

/**
 * Plans: named roadmaps whose ordered phases group existing tickets by id. They
 * store nothing about a ticket, so progress is always computed from the tickets
 * themselves, and attaching one to a phase never changes its status,
 * dependencies or backlog place.
 */

const phaseInput = z.object({
  id: z
    .string()
    .optional()
    .describe('Keep the id from plan_read for an existing phase. Omit it to add a new phase.'),
  title: z.string().min(1),
  scope: z.string().optional().describe('What the phase covers. Markdown.'),
  value: z.string().optional().describe('Why it matters, or why it comes in this order.'),
  tickets: z.array(z.uuid()).optional().describe('Ticket ids, each at most once per phase.'),
})

function describePlan(plan: Plan, listing: TicketListing) {
  const progress = planProgress(plan.frontmatter, listing)
  const byId = new Map(listing.tickets.map((ticket) => [ticket.frontmatter.id, ticket.frontmatter]))
  return {
    id: plan.frontmatter.id,
    title: plan.frontmatter.title,
    revision: plan.revision,
    progress: {
      total: progress.total,
      by_status: progress.byStatus,
      unattributed_done: progress.unattributedDone,
      missing: progress.missing,
      unreadable: progress.unreadable,
      state: progress.state,
    },
    phases: plan.frontmatter.phases.map((phase, index) => {
      const measured = progress.phases[index]!
      return {
        id: phase.id,
        title: phase.title,
        ...(phase.scope !== undefined ? { scope: phase.scope } : {}),
        ...(phase.value !== undefined ? { value: phase.value } : {}),
        state: measured.state,
        tickets: phase.tickets.map((id) => {
          const ticket = byId.get(id)
          if (ticket) return { id, title: ticket.title, status: ticket.status }
          return { id, problem: measured.unreadable.includes(id) ? 'unreadable' : 'missing' }
        }),
      }
    }),
  }
}

export function registerPlanTools(server: McpServer, scope: ProjectScope): void {
  const echo = (project: Project, input: object, value: object): ToolResult =>
    ok(scope.echo(project, input, value))

  const withBody = async (project: Project, plan: Plan) => ({
    ...describePlan(plan, await listTicketRecords(project)),
    body: plan.body,
  })

  server.registerTool(
    'plan_list',
    {
      title: 'List plans',
      description:
        'Every plan with its phases, linked tickets and progress, plus plan files that could ' +
        'not be read (problems). Progress is computed from the tickets: each ticket counts ' +
        'once per plan, a missing or unreadable reference is never counted as done, and a ' +
        'plan or phase with no tickets is "empty", not complete.',
      inputSchema: z.object({ ...scope.shape }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const [plans, tickets] = await Promise.all([
          listPlanRecords(project),
          listTicketRecords(project),
        ])
        return echo(project, input, {
          plans: plans.plans.map((plan) => describePlan(plan, tickets)),
          problems: plans.problems,
        })
      }),
  )

  server.registerTool(
    'plan_read',
    {
      title: 'Read plan',
      description:
        'One plan in full: its Markdown body (goals, ideas, notes), its phases, and the ' +
        'revision needed for plan_update.',
      inputSchema: z.object({ ...scope.shape, id: z.uuid() }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        return echo(project, input, await withBody(project, await readPlan(project, input.id)))
      }),
  )

  server.registerTool(
    'plan_create',
    {
      title: 'Create plan',
      description:
        'Create a new plan. Only a title is required: a plan can start as ideas in its body ' +
        'and gain phases later. Linking a ticket here changes nothing on that ticket.',
      inputSchema: z.object({
        ...scope.shape,
        title: z.string().min(1),
        body: z.string().optional().describe('Markdown. No headings are required.'),
        phases: z.array(phaseInput).optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const plan = await createPlan(project, input)
        return echo(project, input, await withBody(project, plan))
      }),
  )

  server.registerTool(
    'plan_update',
    {
      title: 'Update plan',
      description:
        "Change a plan's title, body, or phases. Requires the revision from plan_read, so " +
        'another edit is never overwritten. `phases` replaces every phase in order: read ' +
        "first, keep each existing phase's id, and keep what you did not mean to change. " +
        'Attaching or detaching a ticket is a phases edit and never changes the ticket. ' +
        "`body` replaces the whole body, so keep the author's text.",
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        expected_revision: z.string().min(1),
        title: z.string().min(1).optional(),
        body: z.string().optional(),
        phases: z.array(phaseInput).optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const plan = await updatePlan(project, input.id, {
          expectedRevision: input.expected_revision,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.phases !== undefined ? { phases: input.phases } : {}),
        })
        return echo(project, input, await withBody(project, plan))
      }),
  )
}
