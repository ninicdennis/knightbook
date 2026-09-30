import { useCallback, useEffect, useState } from 'react'
import type { TicketStatus } from '../../../shared/contract.js'
import {
  decodeColumnFilters,
  EMPTY_FILTER,
  type ColumnFilter,
  type ColumnFilters,
} from './column-filter.js'

/**
 * Each column's filter, remembered per checkout in the window's own storage, the
 * same way the plan filter is (D-035). It is view state: it never reaches the
 * project, MCP, or "next up", and one clone's filters do not follow the user
 * into another.
 */

const storageKey = (rootPath: string) => `knightbook.board.columns:${rootPath}`

function recall(rootPath: string): ColumnFilters {
  try {
    return decodeColumnFilters(window.localStorage.getItem(storageKey(rootPath)))
  } catch {
    return decodeColumnFilters(null)
  }
}

function remember(rootPath: string, filters: ColumnFilters): void {
  try {
    window.localStorage.setItem(storageKey(rootPath), JSON.stringify(filters))
  } catch {
    // Not remembering is harmless; the column stays filtered for now.
  }
}

export function useColumnFilters(rootPath: string) {
  const [filters, setFilters] = useState<ColumnFilters>(() => recall(rootPath))

  useEffect(() => setFilters(recall(rootPath)), [rootPath])

  const setColumnFilter = useCallback(
    (status: TicketStatus, filter: ColumnFilter) => {
      setFilters((current) => {
        const next = { ...current, [status]: filter }
        remember(rootPath, next)
        return next
      })
    },
    [rootPath],
  )

  const clearColumnFilter = useCallback(
    (status: TicketStatus) => setColumnFilter(status, EMPTY_FILTER),
    [setColumnFilter],
  )

  return { filters, setColumnFilter, clearColumnFilter }
}
