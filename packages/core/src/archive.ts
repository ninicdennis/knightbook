import { ProjectError } from './errors.js'
import { parseRecord, serializeRecord } from './frontmatter.js'
import { reservedPaths } from './paths.js'
import type { Project } from './project.js'
import type { Revision } from './revision.js'
import { parseTicket, readTicket, type Ticket } from './tickets.js'
import { readRecord, writeRecord } from './write.js'

/**
 * Taking tickets off the working board and putting them back. Kept apart from
 * tickets.ts because its one rule — archiving changes nothing about where the
 * work stands — is easiest to check when it is all in one place.
 */

/** Whether a ticket has been taken off the working board. */
export function isArchived(ticket: Ticket): boolean {
  return ticket.frontmatter.archived !== undefined
}

/**
 * Takes a ticket off the working board, keeping its file, id, body, links,
 * dependencies, completion provenance and review snapshots exactly as they are.
 *
 * Archiving is not deletion and not a completion decision. Nothing about where
 * the work stands changes, which is why `status` is not touched: an archived
 * Backlog ticket is still unfinished, and restoring it must not be able to
 * present it as accepted.
 *
 * Archiving something already archived is refused rather than silently
 * rewriting `archived_at`, because the second call would move the archive date
 * of a ticket the caller believed it was archiving for the first time.
 */
export async function archiveTicket(
  project: Project,
  id: string,
  expectedRevision: Revision,
): Promise<Ticket> {
  return await setArchived(project, id, expectedRevision, {
    archived_at: new Date().toISOString(),
  })
}

/**
 * Puts a ticket back on the board in the status it kept while archived.
 *
 * Restoring a Done ticket does not reopen it: `completion` is untouched, so the
 * acceptance it carries is neither re-asserted nor withdrawn. That is the whole
 * reason the status was left alone on the way in.
 */
export async function restoreTicket(
  project: Project,
  id: string,
  expectedRevision: Revision,
): Promise<Ticket> {
  return await setArchived(project, id, expectedRevision, null)
}

/** The one writer of `archived`, so archiving and restoring cannot diverge. */
async function setArchived(
  project: Project,
  id: string,
  expectedRevision: Revision,
  archived: { archived_at: string } | null,
): Promise<Ticket> {
  const path = reservedPaths.ticketFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  // Refuse before changing anything: an invalid record stays exactly as it is.
  const current = parseTicket(content, id)

  const alreadyArchived = current.frontmatter.archived !== undefined
  if (archived && alreadyArchived) {
    throw new ProjectError('invalid_transition', `Ticket ${id} is already archived.`)
  }
  if (!archived && !alreadyArchived) {
    throw new ProjectError('invalid_transition', `Ticket ${id} is not archived.`)
  }

  const record = parseRecord(content)
  if (archived) record.data.set('archived', archived)
  else record.data.delete('archived')
  record.data.set('updated_at', new Date().toISOString())

  const next = serializeRecord(record, record.body)
  parseTicket(next, id)

  await writeRecord(project.root, path, next, { expectedRevision })
  return await readTicket(project, id)
}
