import { ProjectError } from '../records/errors.js'
import type { TicketFrontmatter } from '../records/schema.js'

/**
 * Decision D-032: a change to a ticket's prerequisites may not add a reference
 * that is wrong from the start. Only what the change adds is checked. A bad
 * reference already in the file, from a hand edit or an older write, is still
 * reported by readiness rather than refused here; otherwise one broken link
 * would stop anyone removing the others.
 */

export type DependencyProblem =
  | { kind: 'self' }
  | { kind: 'unknown'; ticketId: string }
  /** `path` runs from the added prerequisite back to this ticket. */
  | { kind: 'cycle'; ticketId: string; path: string[] }

export function dependencyChangeProblems(
  ticketId: string,
  before: readonly string[],
  after: readonly string[],
  all: ReadonlyMap<string, TicketFrontmatter>,
  /** Ticket files that exist but could not be read: known, so not called missing. */
  unreadable: ReadonlySet<string> = new Set(),
): DependencyProblem[] {
  const problems: DependencyProblem[] = []
  const graph = new Map(all)
  const self = graph.get(ticketId)
  if (self) graph.set(ticketId, { ...self, depends_on: [...after] })

  for (const id of new Set(after)) {
    if (before.includes(id)) continue
    if (id === ticketId) problems.push({ kind: 'self' })
    else if (!graph.has(id)) {
      if (!unreadable.has(id)) problems.push({ kind: 'unknown', ticketId: id })
    } else {
      const path = pathBetween(id, ticketId, graph)
      if (path) problems.push({ kind: 'cycle', ticketId: id, path })
    }
  }
  return problems
}

/** The prerequisite chain from one ticket to another, or null when there is none. */
function pathBetween(
  from: string,
  to: string,
  all: ReadonlyMap<string, TicketFrontmatter>,
): string[] | null {
  const cameFrom = new Map<string, string | null>([[from, null]])
  const queue = [from]
  while (queue.length > 0) {
    const id = queue.shift() as string
    if (id === to) {
      const path: string[] = []
      for (let step: string | null = id; step !== null; step = cameFrom.get(step) ?? null) {
        path.unshift(step)
      }
      return path
    }
    for (const next of all.get(id)?.depends_on ?? []) {
      if (!cameFrom.has(next)) {
        cameFrom.set(next, id)
        queue.push(next)
      }
    }
  }
  return null
}

/** Throws one error naming every problem, in words a person can act on. */
export function assertDependencyChange(
  ticketId: string,
  before: readonly string[],
  after: readonly string[],
  all: ReadonlyMap<string, TicketFrontmatter>,
  unreadable: ReadonlySet<string> = new Set(),
): void {
  const problems = dependencyChangeProblems(ticketId, before, after, all, unreadable)
  if (problems.length === 0) return

  const name = (id: string) => {
    const title = all.get(id)?.title
    return title === undefined ? id : `"${title}"`
  }
  const sentences = problems.map((problem) => {
    switch (problem.kind) {
      case 'self':
        return 'A ticket cannot depend on itself.'
      case 'unknown':
        return `There is no ticket ${problem.ticketId} in this project.`
      case 'cycle':
        return (
          `${name(problem.ticketId)} already leads back to this ticket ` +
          `(${problem.path.map(name).join(' -> ')}), so depending on it would make a cycle.`
        )
    }
  })
  throw new ProjectError(
    'invalid_dependency',
    `The prerequisites were not changed. ${sentences.join(' ')}`,
  )
}
