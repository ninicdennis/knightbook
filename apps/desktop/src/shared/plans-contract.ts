import type { RecordProblemView, Result, TicketStatus } from './contract.js'

/**
 * Plans as the window shows them. Progress is computed in the host by the same
 * core function MCP uses, so the pane and an AI client can never report
 * different numbers for one plan. The app creates plans and edits their
 * phases and ticket links through core's `createPlan` and `updatePlan`, the same
 * functions MCP uses; a plan's Markdown body is still edited externally.
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
  /** What the window read; every edit sends it back so a stale one is refused. */
  revision: string
  progress: ProgressView
  phases: PlanPhaseView[]
}

export interface PlansView {
  plans: PlanView[]
  /** Plan files that could not be read; the others still load. */
  problems: RecordProblemView[]
}

/**
 * A phase as the window writes it. An `id` keeps an existing phase, and with it
 * every ticket attached to it; leaving it out asks core for a new one. Scope and
 * value are sent back as they were read, since the app does not edit them.
 */
export interface PhaseEdit {
  id?: string
  title: string
  scope: string | null
  value: string | null
  /** Ticket ids in order. Only the plan file changes: no ticket is touched. */
  tickets: string[]
}

export interface CreatedPlanView {
  id: string
  plans: PlansView
}

export interface PlansApi {
  listPlans(rootPath: string): Promise<Result<PlansView>>
  /** Creates a plan with no phases from a title. */
  createPlan(rootPath: string, title: string): Promise<Result<CreatedPlanView>>
  /**
   * Replaces a plan's phases, in order, at the revision the window read. A plan
   * changed since is refused with `revision_conflict` and nothing is written.
   */
  setPlanPhases(
    rootPath: string,
    planId: string,
    phases: PhaseEdit[],
    revision: string,
  ): Promise<Result<PlansView>>
  /** Opens a plan's file with the system's handler. The host builds the path from the id. */
  openPlanExternally(rootPath: string, id: string): Promise<Result<null>>
}
