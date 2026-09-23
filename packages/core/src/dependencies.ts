import type { TicketFrontmatter } from './schema.js'

/**
 * Dependency readiness from product decision D-014 and technical design section
 * 5: a prerequisite in Verification or Done lets dependent work start. Reaching
 * Verification does not mark the prerequisite done or human-reviewed.
 */

const SATISFYING_STATUSES = new Set(['verification', 'done'])

export type IneligibilityReason =
  | { kind: 'prerequisite_not_ready'; ticketId: string; title: string; status: string }
  | { kind: 'prerequisite_archived'; ticketId: string; title: string; status: string }
  | { kind: 'prerequisite_missing'; ticketId: string }
  | { kind: 'prerequisite_unreadable'; ticketId: string }
  | { kind: 'self_dependency' }
  | { kind: 'dependency_cycle'; cycle: string[] }
  | { kind: 'blocked'; explanation: string }
  | {
      kind: 'prerequisite_failed_verification'
      ticketId: string
      title: string
      /** The reason recorded on the prerequisite, not a summary of it. */
      issue: string
      /** False when the failure is further up the chain than this ticket's own prerequisites. */
      direct: boolean
    }

/** A prerequisite carrying an unresolved verification issue, as seen from a dependent. */
export interface FailedPrerequisite {
  readonly ticketId: string
  readonly title: string
  readonly issue: string
  readonly direct: boolean
}

export interface Readiness {
  readonly ready: boolean
  readonly reasons: IneligibilityReason[]
}

export function evaluateReadiness(
  ticket: TicketFrontmatter,
  all: ReadonlyMap<string, TicketFrontmatter>,
  /** Ids of ticket files that exist but could not be read, so they are not called missing. */
  unreadable: ReadonlySet<string> = new Set(),
): Readiness {
  const reasons: IneligibilityReason[] = []

  if (ticket.blocker) {
    reasons.push({ kind: 'blocked', explanation: ticket.blocker })
  }

  for (const id of ticket.depends_on) {
    if (id === ticket.id) {
      reasons.push({ kind: 'self_dependency' })
      continue
    }
    const prerequisite = all.get(id)
    if (!prerequisite) {
      reasons.push(
        unreadable.has(id)
          ? { kind: 'prerequisite_unreadable', ticketId: id }
          : { kind: 'prerequisite_missing', ticketId: id },
      )
      continue
    }
    if (!SATISFYING_STATUSES.has(prerequisite.status)) {
      /*
       * Archiving takes a ticket off the board; it does not finish it. An
       * unfinished prerequisite that disappears from view must not quietly
       * start satisfying its dependents, or archiving a column would unblock
       * work that nobody did. It is named separately from an ordinary
       * not-ready prerequisite because the reader cannot see it on the board
       * and would otherwise go looking for it.
       */
      reasons.push({
        kind: prerequisite.archived ? 'prerequisite_archived' : 'prerequisite_not_ready',
        ticketId: id,
        title: prerequisite.title,
        status: prerequisite.status,
      })
    }
  }

  for (const failed of failedPrerequisites(ticket, all)) {
    reasons.push({ kind: 'prerequisite_failed_verification', ...failed })
  }

  const cycle = findCycle(ticket.id, all)
  if (cycle) reasons.push({ kind: 'dependency_cycle', cycle })

  return { ready: reasons.length === 0, reasons }
}

/**
 * Decision D-017: work resting on a prerequisite that failed verification is
 * affected work. The flag is derived here on every read rather than written onto
 * the dependents, so resolving the issue on the prerequisite clears it
 * everywhere at once and no downstream record is ever rewritten.
 *
 * The walk is transitive: if B failed and C depends on B through A, C is still
 * built on the failure. Section 5 gives this precedence over the prerequisite's
 * status, so a failed ticket sitting in Verification no longer unlocks anything.
 */
export function failedPrerequisites(
  ticket: TicketFrontmatter,
  all: ReadonlyMap<string, TicketFrontmatter>,
): FailedPrerequisite[] {
  const found: FailedPrerequisite[] = []
  const seen = new Set<string>([ticket.id])
  // Breadth-first from the ticket's own prerequisites, so direct failures are
  // reported before ones further up the chain. The seen set makes a dependency
  // cycle terminate here rather than recursing forever.
  let frontier = ticket.depends_on.filter((id) => id !== ticket.id)
  let direct = true

  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)

      const prerequisite = all.get(id)
      if (!prerequisite) continue

      if (prerequisite.verification_issue) {
        found.push({
          ticketId: id,
          title: prerequisite.title,
          issue: prerequisite.verification_issue.reason,
          direct,
        })
      }
      next.push(...prerequisite.depends_on)
    }
    frontier = next
    direct = false
  }

  return found
}

/** Returns the cycle path if this ticket participates in one, else null. */
function findCycle(start: string, all: ReadonlyMap<string, TicketFrontmatter>): string[] | null {
  const path: string[] = []
  const onPath = new Set<string>()
  const settled = new Set<string>()

  function visit(id: string): string[] | null {
    if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id]
    if (settled.has(id)) return null

    const ticket = all.get(id)
    if (!ticket) return null

    onPath.add(id)
    path.push(id)
    for (const next of ticket.depends_on) {
      const found = visit(next)
      if (found) return found
    }
    path.pop()
    onPath.delete(id)
    settled.add(id)
    return null
  }

  return visit(start)
}

export function describeReason(reason: IneligibilityReason): string {
  switch (reason.kind) {
    case 'prerequisite_not_ready':
      return `waiting on "${reason.title}" (${reason.ticketId}), which is ${reason.status}`
    case 'prerequisite_archived':
      return (
        `waiting on "${reason.title}" (${reason.ticketId}), which was archived while still ` +
        `${reason.status}; archiving did not finish it, so restore it or drop the dependency`
      )
    case 'prerequisite_missing':
      return `depends on ${reason.ticketId}, which does not exist in this project`
    case 'prerequisite_unreadable':
      return `depends on ${reason.ticketId}, whose file could not be read (see the record problems)`
    case 'self_dependency':
      return 'depends on itself'
    case 'dependency_cycle':
      return `is part of a dependency cycle: ${reason.cycle.join(' -> ')}`
    case 'blocked':
      return `is blocked: ${reason.explanation}`
    case 'prerequisite_failed_verification':
      return (
        `rests on "${reason.title}" (${reason.ticketId})` +
        `${reason.direct ? '' : ', further up the chain,'} which failed verification: ` +
        `${reason.issue}`
      )
  }
}
