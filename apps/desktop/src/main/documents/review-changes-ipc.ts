import { ipcMain } from 'electron'
import {
  documentRecordId,
  openProject,
  ProjectError,
  readDocument,
  readRecord,
  reservedPaths,
  reviewChanges,
  ticketRecordId,
  type ReviewChanges,
} from '@knightbook/core'
import type { ReviewChangesView } from '../../shared/contract.js'
import { guard } from '../guard.js'

/**
 * The changes-since-review comparison for the window. Both handlers only read:
 * the comparison is computed in the host from files on disk, and recording a
 * review stays a separate, explicit user action that names the revision shown.
 */

/** A ticket id names one file in the tickets folder; it is a UUID in practice. */
const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function toView(changes: ReviewChanges): ReviewChangesView {
  return {
    state: changes.state,
    reviewedAt: changes.lastReview?.reviewedAt ?? null,
    currentRevision: changes.currentRevision,
    unreadableSnapshots: changes.unreadableSnapshots,
    substantive: changes.substantive,
    sections: changes.sections.map((section) => ({
      part: section.part,
      added: section.added,
      removed: section.removed,
      lines: section.lines.map((line) => ({ ...line })),
    })),
    notes: [...changes.notes],
    tooLarge: changes.tooLarge,
  }
}

export function registerReviewChangesHandlers(): void {
  ipcMain.handle(
    'document:changes',
    async (_event, rootPath: unknown, path: unknown) =>
      await guard<ReviewChangesView>(async () => {
        if (typeof rootPath !== 'string' || typeof path !== 'string') {
          throw new Error('A project and document path are required.')
        }

        const project = await openProject(rootPath)
        const document = await readDocument(project, path)
        const recordId = documentRecordId(project, document.path)
        return toView(await reviewChanges(project, recordId, document.content))
      }),
  )

  ipcMain.handle(
    'ticket:changes',
    async (_event, rootPath: unknown, id: unknown) =>
      await guard<ReviewChangesView>(async () => {
        if (typeof rootPath !== 'string' || typeof id !== 'string') {
          throw new Error('A project and ticket are required.')
        }
        if (!PLAIN_ID.test(id)) {
          throw new ProjectError('not_found', 'That ticket no longer exists in this project.')
        }

        const project = await openProject(rootPath)
        const { content } = await readRecord(
          project.root,
          reservedPaths.ticketFile(project.root, id),
        )
        return toView(await reviewChanges(project, ticketRecordId(id), content))
      }),
  )
}
