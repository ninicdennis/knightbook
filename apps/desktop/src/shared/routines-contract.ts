import type { RecordProblemView, Result, TicketStatus } from './contract.js'

/**
 * Routines as the window shows them (D-051). The history is computed in the host
 * by the same core function MCP uses, from the run tickets themselves, so the
 * pane and an AI client can never disagree about which runs were accepted.
 */

/** One run: an ordinary ticket started from the routine. */
export interface RoutineRunView {
  ticketId: string
  title: string
  status: TicketStatus
  archived: boolean
  startedAt: string
  /** When the user's acceptance was recorded. Null unless Done and accepted. */
  acceptedAt: string | null
  /** Done with no recorded decision: shown as it is, never as completed. */
  completionUnattributed: boolean
}

export interface RoutineView {
  id: string
  title: string
  /** The routine's Markdown instructions. Untrusted, rendered sanitized. */
  instructions: string
  /** Project-relative path of the routine file. */
  file: string
  /** What the window read; an edit sends it back so a stale one is refused. */
  revision: string
  /** Every run, newest first. */
  runs: RoutineRunView[]
  /** Runs on the board and not Done. Starting another while any exist must be deliberate. */
  openRunIds: string[]
  lastCompletedAt: string | null
  completedCount: number
}

export interface RoutinesView {
  routines: RoutineView[]
  /** Routine files that could not be read; the others still load. */
  problems: RecordProblemView[]
  /** Ticket files that could not be read. Any of them could be a run, so history may be partial. */
  unreadableTickets: number
}

/** A routine as the window writes it. */
export interface RoutineEdit {
  title: string
  instructions: string
}

export interface CreatedRoutineView {
  id: string
  routines: RoutinesView
}

export interface StartedRunView {
  ticketId: string
  routines: RoutinesView
}

export interface RoutinesApi {
  listRoutines(rootPath: string): Promise<Result<RoutinesView>>
  createRoutine(rootPath: string, edit: RoutineEdit): Promise<Result<CreatedRoutineView>>
  /** Saves at the revision the window read; a routine changed since is refused. */
  updateRoutine(
    rootPath: string,
    id: string,
    edit: RoutineEdit,
    revision: string,
  ): Promise<Result<RoutinesView>>
  /**
   * Creates the next run as a Backlog ticket. Refused with `run_already_open`
   * while a run is unfinished, unless `anotherRun` says a second is deliberate.
   */
  startRoutineRun(
    rootPath: string,
    id: string,
    anotherRun: boolean,
  ): Promise<Result<StartedRunView>>
}
