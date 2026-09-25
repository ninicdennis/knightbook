import { ipcMain } from 'electron'
import { archiveTicket, openProject, restoreTicket } from '@knightbook/core'
import { guard } from '../guard.js'
import { buildView, titleOf } from '../project/project-view.js'
import type { ArchiveFailureView, ArchiveOutcome, ProjectView } from '../../shared/contract.js'

/**
 * Taking tickets off the board and putting them back. Neither is a decision
 * about the work: the status a ticket had is the status it keeps.
 */
export function registerArchiveHandlers(): void {
  /**
   * Bulk archive. Each ticket is its own file and its own write, so this is a
   * sequence of independent operations, not a transaction: what succeeded stays
   * succeeded and the rest are named. The caller supplies the revisions it was
   * showing, so a ticket created or changed after the user opened the
   * confirmation is either not in the list at all or is refused by name.
   */
  ipcMain.handle(
    'ticket:archive',
    async (_event, rootPath: unknown, targets: unknown) =>
      await guard<ArchiveOutcome>(async () => {
        if (typeof rootPath !== 'string' || !Array.isArray(targets)) {
          throw new Error('A project and the tickets to archive are required.')
        }
        const wanted = targets.map((target) => {
          const { id, revision } = (target ?? {}) as { id?: unknown; revision?: unknown }
          if (typeof id !== 'string' || typeof revision !== 'string') {
            throw new Error('Each ticket to archive needs an id and the revision you read.')
          }
          return { id, revision }
        })

        const project = await openProject(rootPath)
        const failures: ArchiveFailureView[] = []
        let archivedCount = 0
        for (const target of wanted) {
          try {
            await archiveTicket(project, target.id, target.revision)
            archivedCount += 1
          } catch (error) {
            failures.push({
              id: target.id,
              // Named, so a partial failure can be reported as something the
              // user recognises rather than as a bare id.
              title: await titleOf(project, target.id),
              reason: error instanceof Error ? error.message : String(error),
            })
          }
        }
        return { archivedCount, failures, project: await buildView(project) }
      }),
  )

  ipcMain.handle(
    'ticket:restore',
    async (_event, rootPath: unknown, id: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
          throw new Error('A project, ticket, and revision are required.')
        }
        const project = await openProject(rootPath)
        await restoreTicket(project, id, revision)
        return await buildView(project)
      }),
  )
}
