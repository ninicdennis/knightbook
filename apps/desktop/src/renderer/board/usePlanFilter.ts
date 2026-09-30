import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardPlanView } from '../../shared/contract.js'

/**
 * Which plan the board is narrowed to, per project (D-035).
 *
 * This is view state for this window, like which document folders are
 * collapsed, so it lives in the renderer's own storage keyed by checkout path:
 * choosing a plan never writes to the project, never reaches MCP, and never
 * changes what "next up" suggests. One checkout's choice does not follow the
 * user into another clone of the same project.
 *
 * A remembered plan that no longer exists falls back to all tickets, so the
 * board never sits filtered to something the user cannot see or clear.
 */

export type PlanFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'plan'; id: string }

const ALL: PlanFilter = { kind: 'all' }

const storageKey = (rootPath: string) => `knightbook.board.plan:${rootPath}`

export function encodePlanFilter(filter: PlanFilter): string {
  return filter.kind === 'plan' ? `plan:${filter.id}` : filter.kind
}

export function decodePlanFilter(value: string | null): PlanFilter {
  if (value === 'none') return { kind: 'none' }
  if (value?.startsWith('plan:') && value.length > 5) return { kind: 'plan', id: value.slice(5) }
  return ALL
}

/** Remembers a choice for a project; used by the Plans view's "View on board" too. */
export function rememberPlanFilter(rootPath: string, filter: PlanFilter): void {
  try {
    window.localStorage.setItem(storageKey(rootPath), encodePlanFilter(filter))
  } catch {
    // Not remembering the filter is harmless; the board still filters for now.
  }
}

function recallPlanFilter(rootPath: string): PlanFilter {
  try {
    return decodePlanFilter(window.localStorage.getItem(storageKey(rootPath)))
  } catch {
    return ALL
  }
}

/** Whether a ticket belongs in the view the filter selects. */
export function ticketMatches(
  filter: PlanFilter,
  ticketId: string,
  plans: readonly BoardPlanView[],
): boolean {
  switch (filter.kind) {
    case 'all':
      return true
    case 'none':
      return !plans.some((plan) => plan.ticketIds.includes(ticketId))
    case 'plan':
      return plans.find((plan) => plan.id === filter.id)?.ticketIds.includes(ticketId) ?? false
  }
}

export function usePlanFilter(rootPath: string, plans: readonly BoardPlanView[]) {
  const [stored, setStored] = useState<PlanFilter>(() => recallPlanFilter(rootPath))

  useEffect(() => setStored(recallPlanFilter(rootPath)), [rootPath])

  const filter = useMemo<PlanFilter>(
    () => (stored.kind === 'plan' && !plans.some((plan) => plan.id === stored.id) ? ALL : stored),
    [stored, plans],
  )

  const setFilter = useCallback(
    (next: PlanFilter) => {
      setStored(next)
      rememberPlanFilter(rootPath, next)
    },
    [rootPath],
  )

  const matches = useCallback(
    (ticketId: string) => ticketMatches(filter, ticketId, plans),
    [filter, plans],
  )

  return { filter, setFilter, matches }
}
