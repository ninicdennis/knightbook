import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  includeDocuments,
  initializeProject,
  isProjectError,
  resolveProjectRoot,
} from '@projectspace/core'
import type { FolderInspection, SetupOutcome } from '../shared/contract.js'

/**
 * Setting up a folder without an AI tool. It goes through the same core
 * operations the MCP server uses, so a project made here is indistinguishable
 * from one an AI created.
 */

/** The only documents offered at setup. Anything else is included later, deliberately. */
const CANDIDATES = [
  { path: 'README.md', kind: 'file' },
  { path: 'docs', kind: 'directory' },
] as const

const CANDIDATE_PATHS: readonly string[] = CANDIDATES.map((candidate) => candidate.path)

export async function inspectFolder(path: string): Promise<FolderInspection> {
  const root = await resolveProjectRoot(path)
  const suggestions: string[] = []

  for (const candidate of CANDIDATES) {
    try {
      const found = await stat(join(root.path, candidate.path))
      if (candidate.kind === 'file' ? found.isFile() : found.isDirectory()) {
        suggestions.push(candidate.path)
      }
    } catch {
      // Not there, which is the ordinary case for a bare folder.
    }
  }
  return { name: basename(root.path), suggestions }
}

export async function setUpFolder(
  path: string,
  options: { name: string; include: readonly string[] },
): Promise<SetupOutcome> {
  const name = options.name.trim()
  // Only what inspectFolder offered; the renderer cannot widen this.
  const include = options.include.filter((entry) => CANDIDATE_PATHS.includes(entry))

  let project
  try {
    project = await initializeProject(path, name ? { name } : {})
  } catch (error) {
    throw explainSetupFailure(error)
  }

  if (include.length === 0) return { path: project.root.path, warning: null }

  try {
    await includeDocuments(project, include)
    return { path: project.root.path, warning: null }
  } catch (error) {
    // The project exists by now, so this is not a failed setup. Say what is missing.
    const reason = error instanceof Error ? error.message : String(error)
    return {
      path: project.root.path,
      warning:
        `The project was set up, but ${include.join(' and ')} could not be included: ${reason} ` +
        'You can include documents later.',
    }
  }
}

/**
 * Filesystem errors say "EACCES" and little else. A person needs to know whether
 * to fix permissions, pick another folder, or free space, and whether anything
 * was written.
 */
export function explainSetupFailure(error: unknown): Error {
  // Already specific: an existing project, or a .projectspace holding unrelated files.
  if (isProjectError(error)) return error

  const code = (error as NodeJS.ErrnoException | undefined)?.code
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return new Error(
        'Permission denied: Projectspace is not allowed to write in this folder. ' +
          'No project was created. Check the folder’s permissions, or choose another folder.',
      )
    case 'EROFS':
      return new Error(
        'This folder is on a read-only location, so nothing can be written there. ' +
          'No project was created. Choose a folder you can write to.',
      )
    case 'ENOSPC':
      return new Error('The disk is full, so the project could not be created. Free some space and try again.')
    case 'ENOENT':
      return new Error('This folder no longer exists. Choose the folder again.')
    default:
      return new Error(
        `Could not set up this folder: ${error instanceof Error ? error.message : String(error)}`,
      )
  }
}
