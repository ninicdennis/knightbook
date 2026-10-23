import type { TicketStatus } from '../src/shared/contract.js'
import type { RoutinesApi, RoutineView, RoutinesView } from '../src/shared/routines-contract.js'
import { record } from './record.js'

/**
 * Routines for the design preview, chosen so every state the pane shows is on
 * screen: one with an open run and accepted history (including a Done run with
 * no recorded acceptance), one never run, and edits kept in memory.
 */

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) =>
  new Date(Date.parse('2026-10-22T09:00:00Z') - days * DAY).toISOString()

function run(
  ticketId: string,
  status: TicketStatus,
  startedDaysAgo: number,
  acceptedDaysAgo: number | null,
  completionUnattributed = false,
) {
  return {
    ticketId,
    title: 'Weekly package review',
    status,
    archived: false,
    startedAt: ago(startedDaysAgo),
    acceptedAt: acceptedDaysAgo === null ? null : ago(acceptedDaysAgo),
    completionUnattributed,
  }
}

let ROUTINES: RoutineView[] = [
  {
    id: '3b1f6a2e-8c4d-4e5f-9a0b-1c2d3e4f5a6b',
    title: 'Weekly package review',
    instructions:
      '# Weekly package review\n\n## What to do\n\n- Run `pnpm outdated` and list what changed.\n- Read the changelog of anything with a new major version.\n- Record the findings, even when nothing needs updating.\n\n## When\n\nWeekly, on Mondays. Knightbook does not start runs on its own.\n',
    file: '.projectspace/routines/3b1f6a2e-8c4d-4e5f-9a0b-1c2d3e4f5a6b.md',
    revision: 'rev-1',
    runs: [
      run('board', 'verification', 1, null),
      run('schema', 'done', 8, 6),
      run('packaging', 'done', 15, null, true),
      run('writes', 'done', 22, 21),
    ],
    openRunIds: ['board'],
    lastCompletedAt: ago(6),
    completedCount: 2,
  },
  {
    id: '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
    title: 'Monthly security check',
    instructions:
      '# Monthly security check\n\nRun `pnpm audit`, check the Electron release notes for security fixes, and record what was found.\n',
    file: '.projectspace/routines/6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f.md',
    revision: 'rev-1',
    runs: [],
    openRunIds: [],
    lastCompletedAt: null,
    completedCount: 0,
  },
]

const listing = (): RoutinesView => ({ routines: ROUTINES, problems: [], unreadableTickets: 0 })
let made = 1

export const routinesStub: RoutinesApi = {
  listRoutines: async () => ({ ok: true, value: listing() }),
  createRoutine: async (_rootPath, edit) => {
    record('createRoutine', edit)
    const id = `0000000${(made += 1)}-0000-4000-8000-00000000000a`.slice(-36)
    ROUTINES = [
      ...ROUTINES,
      {
        id,
        title: edit.title,
        instructions: edit.instructions,
        file: `.projectspace/routines/${id}.md`,
        revision: 'rev-1',
        runs: [],
        openRunIds: [],
        lastCompletedAt: null,
        completedCount: 0,
      },
    ]
    return { ok: true, value: { id, routines: listing() } }
  },
  updateRoutine: async (_rootPath, id, edit, revision) => {
    record('updateRoutine', id, edit, revision)
    ROUTINES = ROUTINES.map((routine) =>
      routine.id === id ? { ...routine, ...edit, revision: `${routine.revision}+` } : routine,
    )
    return { ok: true, value: listing() }
  },
  startRoutineRun: async (_rootPath, id, anotherRun) => {
    record('startRoutineRun', id, anotherRun)
    const routine = ROUTINES.find((r) => r.id === id)
    if (routine && routine.openRunIds.length > 0 && !anotherRun) {
      return {
        ok: false,
        code: 'run_already_open',
        message: 'This routine already has an open run.',
      }
    }
    const ticketId = 'review'
    ROUTINES = ROUTINES.map((r) =>
      r.id === id
        ? {
            ...r,
            runs: [{ ...run(ticketId, 'backlog', 0, null), title: r.title }, ...r.runs],
            openRunIds: [ticketId, ...r.openRunIds],
          }
        : r,
    )
    return { ok: true, value: { ticketId, routines: listing() } }
  },
}
