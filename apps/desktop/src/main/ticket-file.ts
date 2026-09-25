import { ProjectError, readRecord, reservedPaths, type Project } from '@knightbook/core'
import { dirname, resolve } from 'node:path'

/**
 * Which file to hand the user's editor for a ticket or a plan. The renderer
 * sends only an id, and the path is built here, inside the project's own folder
 * for that kind of record.
 *
 * The file is read as raw text rather than parsed as a record. A record broken
 * by conflict markers or an unsupported schema is exactly the one a person most
 * needs to fix by hand, so refusing to open it would leave them hunting for a
 * UUID filename. Existence and the project boundary are still proven here.
 */

/** A record id names one file in its folder; separators can never appear. */
const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const KINDS = {
  ticket: { file: reservedPaths.ticketFile, dir: reservedPaths.ticketsDir },
  plan: { file: reservedPaths.planFile, dir: reservedPaths.plansDir },
} as const

async function recordFileToOpen(
  project: Project,
  kind: keyof typeof KINDS,
  id: unknown,
): Promise<string> {
  if (typeof id !== 'string' || !PLAIN_ID.test(id) || id.includes('..')) {
    throw new ProjectError('not_found', `That is not a ${kind} id.`)
  }
  const path = KINDS[kind].file(project.root, id)
  if (dirname(resolve(path)) !== resolve(KINDS[kind].dir(project.root))) {
    throw new ProjectError('outside_project', `That id does not name a ${kind} file.`)
  }
  try {
    // Proves the file exists and that its real path, links resolved, is in the project.
    await readRecord(project.root, path)
  } catch (error) {
    if (error instanceof ProjectError && error.code === 'not_found') {
      throw new ProjectError('not_found', `No ${kind} ${id} in this project.`)
    }
    throw error
  }
  return path
}

export function ticketFileToOpen(project: Project, id: unknown): Promise<string> {
  return recordFileToOpen(project, 'ticket', id)
}

export function planFileToOpen(project: Project, id: unknown): Promise<string> {
  return recordFileToOpen(project, 'plan', id)
}
