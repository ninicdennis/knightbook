import type { RecordProblemView, Result, TicketStatus } from './contract.js'

/**
 * Plans as the window shows them. Progress is computed in the host by the same
 * core function MCP uses, so the pane and an AI client can never report
 * different numbers for one plan. Plans are read-only in the app for now:
 * phases and links are written through MCP or the plan's own file.
 */

export interface ProgressView {
  /** Distinct tickets referenced, including ones that could not be found or read. */
  total: number
  byStatus: Record<TicketStatus, number>
  /** Done without a trustworthy completion record; still counted as done. */
  unattributedDone: number
  missing: string[]
  unreadable: string[]
  /** `empty` means nothing is planned yet, which is not the same as finished. */
  state: 'empty' | 'in_progress' | 'complete'
}

/** A reference from a phase to a ticket, resolved against the board when read. */
export interface PlanTicketView {
  id: string
  /** Null when the ticket could not be found or read; `problem` says which. */
  title: string | null
  status: TicketStatus | null
  archived: boolean
  problem: 'missing' | 'unreadable' | null
}

export interface PlanPhaseView {
  id: string
  title: string
  scope: string | null
  value: string | null
  progress: ProgressView
  tickets: PlanTicketView[]
}

export interface PlanView {
  id: string
  title: string
  /** The plan's Markdown body: goals, ideas and notes. Untrusted, rendered sanitized. */
  body: string
  /** Project-relative path of the plan file. */
  file: string
  progress: ProgressView
  phases: PlanPhaseView[]
}

export interface PlansView {
  plans: PlanView[]
  /** Plan files that could not be read; the others still load. */
  problems: RecordProblemView[]
}

export interface PlansApi {
  listPlans(rootPath: string): Promise<Result<PlansView>>
  /** Opens a plan's file with the system's handler. The host builds the path from the id. */
  openPlanExternally(rootPath: string, id: string): Promise<Result<null>>
}
