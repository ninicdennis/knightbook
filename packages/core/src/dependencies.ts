import type { TicketFrontmatter } from './schema.js'

/**
 * Dependency readiness from product decision D-014 and technical design section
 * 5: a prerequisite in Verification or Done lets dependent work start. Reaching
 * Verification does not mark the prerequisite done or human-reviewed.
 */

const SATISFYING_STATUSES = new Set(['verification', 'done'])

export type IneligibilityReason =
  | { kind: 'prerequisite_not_ready'; ticketId: string; title: string; status: string }
  | { kind: 'prerequisite_missing'; ticketId: string }
  | { kind: 'prerequisite_unreadable'; ticketId: string }
  | { kind: 'self_dependency' }
  | { kind: 'dependency_cycle'; cycle: string[] }
  | { kind: 'blocked'; explanation: string }

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
      reasons.push({
        kind: 'prerequisite_not_ready',
        ticketId: id,
        title: prerequisite.title,
        status: prerequisite.status,
      })
    }
  }

  const cycle = findCycle(ticket.id, all)
  if (cycle) reasons.push({ kind: 'dependency_cycle', cycle })

  return { ready: reasons.length === 0, reasons }
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
  }
}
