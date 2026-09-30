import type {
  PlanTicketView,
  PlansApi,
  PlanView,
  ProgressView,
} from '../src/shared/plans-contract.js'
import type { TicketStatus, BoardPlanView } from '../src/shared/contract.js'
import { record } from './record.js'

/**
 * Plans over the stub board's tickets, chosen so every state the pane can show
 * is on screen: a plan in progress with a shared ticket and a missing one, a
 * finished plan, and a plan that is still only ideas.
 */

const TICKETS: Record<string, { title: string; status: TicketStatus }> = {
  board: { title: 'Build the Kanban board', status: 'backlog' },
  review: { title: 'Track human review status', status: 'backlog' },
  editor: { title: 'Evaluate the formatted editor', status: 'in_progress' },
  writes: { title: 'Implement the safe write path', status: 'verification' },
  importer: { title: 'Import dated records', status: 'verification' },
  schema: { title: 'Define the Markdown record schema', status: 'done' },
  packaging: { title: 'Package the MCP runtime', status: 'done' },
}

function ref(id: string): PlanTicketView {
  const ticket = TICKETS[id]
  return ticket
    ? { id, title: ticket.title, status: ticket.status, archived: false, problem: null }
    : { id, title: null, status: null, archived: false, problem: 'missing' }
}

function progress(ids: string[]): ProgressView {
  const unique = [...new Set(ids)]
  const byStatus = { backlog: 0, in_progress: 0, verification: 0, done: 0 }
  const missing: string[] = []
  for (const id of unique) {
    const ticket = TICKETS[id]
    if (ticket) byStatus[ticket.status] += 1
    else missing.push(id)
  }
  const total = unique.length
  return {
    total,
    byStatus,
    unattributedDone: 0,
    missing,
    unreadable: [],
    state: total === 0 ? 'empty' : byStatus.done === total ? 'complete' : 'in_progress',
  }
}

function plan(
  id: string,
  title: string,
  body: string,
  phases: Array<{ id: string; title: string; value?: string; tickets: string[] }>,
): PlanView {
  return {
    id,
    title,
    body,
    file: `.projectspace/plans/${id}.md`,
    progress: progress(phases.flatMap((phase) => phase.tickets)),
    phases: phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      scope: null,
      value: phase.value ?? null,
      progress: progress(phase.tickets),
      tickets: phase.tickets.map(ref),
    })),
  }
}

const PLANS: PlanView[] = [
  plan(
    '7c1e0f52-4b8a-4c1d-9e0f-3a5b6c7d8e9f',
    'MVP',
    '# MVP\n\nThe smallest version someone could use every day.\n\n- A board that never loses a write\n- Documents readable in place\n',
    [
      {
        id: 'p1',
        title: 'Foundation',
        value: 'Everything else rests on records that cannot be lost.',
        tickets: ['schema', 'writes', 'packaging'],
      },
      {
        id: 'p2',
        title: 'The board',
        value: 'The first thing a person sees and uses.',
        tickets: ['board', 'writes', 'editor', '00000000-dead-4000-8000-000000000000'],
      },
      { id: 'p3', title: 'Polish', tickets: [] },
    ],
  ),
  plan(
    '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    'Runtime',
    '# Runtime\n\nShip the server so no one needs Node.\n',
    [{ id: 'p1', title: 'Bundle', tickets: ['packaging', 'schema'] }],
  ),
  plan(
    '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    'Launch ideas',
    '# Launch ideas\n\nNot phased yet.\n',
    [],
  ),
]

/** The same plans as the board's filter sees them, so the two views agree. */
export const boardPlansStub: BoardPlanView[] = PLANS.map((plan) => ({
  id: plan.id,
  title: plan.title,
  ticketIds: [...new Set(plan.phases.flatMap((phase) => phase.tickets.map((ticket) => ticket.id)))],
}))

export const plansStub: PlansApi = {
  listPlans: async () => ({ ok: true, value: { plans: PLANS, problems: [] } }),
  openPlanExternally: async (_rootPath, id) => {
    record('openPlanExternally', id)
    return { ok: true, value: null }
  },
}
