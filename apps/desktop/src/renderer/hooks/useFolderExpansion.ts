import { useCallback, useEffect, useState } from 'react'
import { ancestorFolders } from '../document-tree.js'

/**
 * Which document folders are collapsed, per project. This is view state for
 * this window only, so it lives in the renderer's own storage rather than in
 * the project's files: collapsing a folder is never an edit to the project.
 *
 * Collapsed folders are what is stored, so a folder seen for the first time
 * starts open, and storage being unavailable simply means everything is open.
 */

const storageKey = (rootPath: string) => `knightbook.documents.collapsed:${rootPath}`

function readCollapsed(rootPath: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey(rootPath)) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeCollapsed(rootPath: string, collapsed: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey(rootPath), JSON.stringify([...collapsed]))
  } catch {
    // Not remembering a collapsed folder is harmless; the list still works.
  }
}

export function useFolderExpansion(rootPath: string, selected: string | null) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(rootPath))

  useEffect(() => setCollapsed(readCollapsed(rootPath)), [rootPath])

  const update = useCallback(
    (change: (next: Set<string>) => void) =>
      setCollapsed((current) => {
        const next = new Set(current)
        change(next)
        writeCollapsed(rootPath, next)
        return next
      }),
    [rootPath],
  )

  /*
   * A document chosen from a link, search or the list must be visible in it, so
   * its folders open when the selection changes. Only then: collapsing a folder
   * that holds the open document is the user's choice and must stick.
   */
  useEffect(() => {
    if (!selected) return
    setCollapsed((current) => {
      const hidden = ancestorFolders(selected).filter((folder) => current.has(folder))
      if (hidden.length === 0) return current
      const next = new Set(current)
      hidden.forEach((folder) => next.delete(folder))
      writeCollapsed(rootPath, next)
      return next
    })
  }, [selected, rootPath])

  const toggle = useCallback(
    (folder: string) =>
      update((next) => (next.has(folder) ? next.delete(folder) : next.add(folder))),
    [update],
  )

  return { isOpen: (folder: string) => !collapsed.has(folder), toggle }
}
