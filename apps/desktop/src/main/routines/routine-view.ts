import {
  RESERVED_DIR,
  routineHistory,
  type Routine,
  type RoutineListing,
  type TicketListing,
} from '@knightbook/core'
import type { RoutinesView, RoutineView } from '../../shared/routines-contract.js'

/** Routines for the window, each with its history read from the run tickets. */

function toRoutineView(routine: Routine, tickets: TicketListing): RoutineView {
  const history = routineHistory(routine.frontmatter.id, tickets)
  return {
    id: routine.frontmatter.id,
    title: routine.frontmatter.title,
    instructions: routine.body,
    file: `${RESERVED_DIR}/routines/${routine.frontmatter.id}.md`,
    revision: routine.revision,
    runs: history.runs.map((run) => ({
      ticketId: run.id,
      title: run.title,
      status: run.status,
      archived: run.archived,
      startedAt: run.createdAt,
      acceptedAt: run.acceptedAt,
      completionUnattributed: run.completionUnattributed,
    })),
    openRunIds: history.openRuns.map((run) => run.id),
    lastCompletedAt: history.lastCompletedAt,
    completedCount: history.completions.length,
  }
}

export function toRoutinesView(routines: RoutineListing, tickets: TicketListing): RoutinesView {
  return {
    routines: routines.routines.map((routine) => toRoutineView(routine, tickets)),
    problems: routines.problems.map((problem) => ({ file: problem.file, reason: problem.reason })),
    unreadableTickets: tickets.problems.length,
  }
}
