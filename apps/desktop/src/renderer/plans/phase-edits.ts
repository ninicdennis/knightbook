import type { PhaseEdit, PlanPhaseView } from '../../shared/plans-contract.js'

/**
 * Each edit to a plan's phases, as the whole new phase list the host writes.
 * Existing phases keep their ids, so renaming, reordering or removing one never
 * moves a ticket into another phase, and scope and value go back as they were
 * read because the app does not edit them.
 */

export function phaseEdits(phases: readonly PlanPhaseView[]): PhaseEdit[] {
  return phases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    scope: phase.scope,
    value: phase.value,
    tickets: phase.tickets.map((ticket) => ticket.id),
  }))
}

/** A new, empty phase at the end. Core gives it an id. */
export function addPhase(phases: readonly PlanPhaseView[], title: string): PhaseEdit[] {
  return [...phaseEdits(phases), { title, scope: null, value: null, tickets: [] }]
}

export function renamePhase(
  phases: readonly PlanPhaseView[],
  phaseId: string,
  title: string,
): PhaseEdit[] {
  return phaseEdits(phases).map((phase) => (phase.id === phaseId ? { ...phase, title } : phase))
}

/** Null when the phase is already at that end. */
export function movePhase(
  phases: readonly PlanPhaseView[],
  phaseId: string,
  direction: -1 | 1,
): PhaseEdit[] | null {
  const edits = phaseEdits(phases)
  const from = edits.findIndex((phase) => phase.id === phaseId)
  const to = from + direction
  if (from === -1 || to < 0 || to >= edits.length) return null
  const [moved] = edits.splice(from, 1)
  edits.splice(to, 0, moved!)
  return edits
}

/** Removing a phase detaches its tickets from this plan; the tickets are not changed. */
export function removePhase(phases: readonly PlanPhaseView[], phaseId: string): PhaseEdit[] {
  return phaseEdits(phases).filter((phase) => phase.id !== phaseId)
}

export function attachTicket(
  phases: readonly PlanPhaseView[],
  phaseId: string,
  ticketId: string,
): PhaseEdit[] {
  return phaseEdits(phases).map((phase) =>
    phase.id === phaseId && !phase.tickets.includes(ticketId)
      ? { ...phase, tickets: [...phase.tickets, ticketId] }
      : phase,
  )
}

export function detachTicket(
  phases: readonly PlanPhaseView[],
  phaseId: string,
  ticketId: string,
): PhaseEdit[] {
  return phaseEdits(phases).map((phase) =>
    phase.id === phaseId
      ? { ...phase, tickets: phase.tickets.filter((id) => id !== ticketId) }
      : phase,
  )
}
