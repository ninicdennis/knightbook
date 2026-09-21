import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { projectExists, resolveProjectRoot } from '@knightbook/core'
import type { RememberedProject } from '../shared/contract.js'

export interface RememberedEntry {
  /** Absolute checkout path. */
  readonly path: string
  /** The project's name when it was last opened; absent for entries saved before names were kept. */
  readonly name?: string
}

/** Reads the stored list, including entries saved by earlier versions as bare path strings. */
export function parseRememberedEntries(stored: unknown): RememberedEntry[] {
  if (!Array.isArray(stored)) return []

  const entries: RememberedEntry[] = []
  for (const value of stored) {
    if (typeof value === 'string') {
      entries.push({ path: value })
    } else if (typeof value === 'object' && value !== null) {
      const { path, name } = value as { path?: unknown; name?: unknown }
      if (typeof path === 'string') {
        entries.push(typeof name === 'string' ? { path, name } : { path })
      }
    }
  }
  return entries
}

/**
 * A remembered path can go stale: the folder is moved, a drive is unplugged, the
 * records are deleted. Each one is checked when the list is built and reports why
 * it cannot be opened, rather than being dropped or shown as if it still worked.
 */
async function unavailableReason(path: string): Promise<string | null> {
  try {
    if (!(await stat(path)).isDirectory()) return 'This path is not a folder.'
  } catch {
    return 'This folder was not found. It may have been moved, renamed, or deleted.'
  }
  const root = await resolveProjectRoot(path)
  return (await projectExists(root)) ? null : 'This folder no longer has project records.'
}

export async function describeRememberedProjects(
  entries: readonly RememberedEntry[],
): Promise<RememberedProject[]> {
  return await Promise.all(
    entries.map(async (entry) => ({
      path: entry.path,
      name: entry.name ?? basename(entry.path),
      unavailable: await unavailableReason(entry.path),
    })),
  )
}
