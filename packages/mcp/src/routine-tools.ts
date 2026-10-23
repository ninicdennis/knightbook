import {
  createRoutine,
  listRoutineRecords,
  listTicketRecords,
  readRoutine,
  routineHistory,
  startRoutineRun,
  updateRoutine,
  type Project,
  type Routine,
  type RoutineHistory,
  type TicketListing,
} from '@knightbook/core'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { guard, ok, type ToolResult } from './result.js'
import type { ProjectScope } from './scope.js'

/**
 * Routines (D-051): recurring work kept as permanent instructions. Each run is
 * an ordinary Backlog ticket with a copy of the instructions, so it is handed
 * off and accepted like any other. History is read from those tickets; the
 * routine stores no completion of its own, and nothing here schedules a run.
 */

function describeHistory(history: RoutineHistory) {
  const run = (r: RoutineHistory['runs'][number]) => ({
    ticket_id: r.id,
    title: r.title,
    status: r.status,
    archived: r.archived,
    started_at: r.createdAt,
    accepted_at: r.acceptedAt,
    completion_unattributed: r.completionUnattributed,
  })
  return {
    runs: history.runs.map(run),
    open_runs: history.openRuns.map((r) => r.id),
    last_completed_at: history.lastCompletedAt,
    completed_runs: history.completions.length,
    unreadable_ticket_files: history.unreadableTickets,
  }
}

function describeRoutine(routine: Routine, listing: TicketListing) {
  return {
    id: routine.frontmatter.id,
    title: routine.frontmatter.title,
    revision: routine.revision,
    created_at: routine.frontmatter.created_at,
    updated_at: routine.frontmatter.updated_at,
    ...describeHistory(routineHistory(routine.frontmatter.id, listing)),
  }
}

export function registerRoutineTools(server: McpServer, scope: ProjectScope): void {
  const echo = (project: Project, input: object, value: object): ToolResult =>
    ok(scope.echo(project, input, value))

  const full = async (project: Project, routine: Routine) => ({
    ...describeRoutine(routine, await listTicketRecords(project)),
    instructions: routine.body,
  })

  server.registerTool(
    'routine_list',
    {
      title: 'List routines',
      description:
        'Every routine with its runs and when one was last accepted, plus routine files that ' +
        'could not be read (problems). A run counts as completed only while its ticket is Done ' +
        "with the user's recorded acceptance; a run in Verification is not completed.",
      inputSchema: z.object({ ...scope.shape }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const [routines, tickets] = await Promise.all([
          listRoutineRecords(project),
          listTicketRecords(project),
        ])
        return echo(project, input, {
          routines: routines.routines.map((routine) => describeRoutine(routine, tickets)),
          problems: routines.problems,
        })
      }),
  )

  server.registerTool(
    'routine_read',
    {
      title: 'Read routine',
      description:
        'One routine in full: its instructions (Markdown), its runs, and the revision ' +
        'routine_update needs.',
      inputSchema: z.object({ ...scope.shape, id: z.uuid() }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        return echo(project, input, await full(project, await readRoutine(project, input.id)))
      }),
  )

  server.registerTool(
    'routine_create',
    {
      title: 'Create routine',
      description:
        'Create a routine: recurring work, such as a weekly package review, kept as ' +
        'instructions. A cadence can be mentioned in the instructions, but Knightbook never ' +
        'runs or schedules anything.',
      inputSchema: z.object({
        ...scope.shape,
        title: z.string().min(1),
        instructions: z.string().optional().describe('Markdown: what each run should do.'),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const routine = await createRoutine(project, input)
        return echo(project, input, await full(project, routine))
      }),
  )

  server.registerTool(
    'routine_update',
    {
      title: 'Update routine',
      description:
        "Change a routine's title or instructions. Requires the revision from routine_read. " +
        '`instructions` replaces the whole text, so keep what you did not mean to change. Runs ' +
        'already started keep the copy they were given.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        expected_revision: z.string().min(1),
        title: z.string().min(1).optional(),
        instructions: z.string().optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const routine = await updateRoutine(project, input.id, {
          expectedRevision: input.expected_revision,
          title: input.title,
          instructions: input.instructions,
        })
        return echo(project, input, await full(project, routine))
      }),
  )

  server.registerTool(
    'routine_start_run',
    {
      title: 'Start routine run',
      description:
        'Create the next run of a routine: a Backlog ticket with a copy of its title and ' +
        'instructions, linked to the routine. Work it like any ticket and hand off in ' +
        'Verification, recording findings even when nothing changed. Refused with ' +
        'run_already_open while an earlier run is unfinished; pass another_run only when the ' +
        'user wants a second run alongside it.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        another_run: z.boolean().optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const { ticket } = await startRoutineRun(project, input.id, {
          anotherRun: input.another_run,
        })
        return echo(project, input, {
          ticket_id: ticket.frontmatter.id,
          revision: ticket.revision,
          title: ticket.frontmatter.title,
          status: ticket.frontmatter.status,
          routine_id: input.id,
        })
      }),
  )
}
