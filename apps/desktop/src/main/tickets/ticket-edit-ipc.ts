import { ipcMain } from 'electron'
import { openProject, updateTicket } from '@knightbook/core'
import { guard } from '../guard.js'
import { buildView } from '../project/project-view.js'
import type { ProjectView } from '../../shared/contract.js'

/**
 * A blocker is either a reason or absent. Blank text means "clear it", because a
 * ticket holding an empty blocker would still read as blocked to anything that
 * only checks whether the field is there.
 */
export function parseBlocker(blocker: unknown): string | null {
  if (blocker === null) return null
  if (typeof blocker !== 'string') throw new Error('A blocker must be text, or null to clear it.')
  const trimmed = blocker.trim()
  return trimmed === '' ? null : trimmed
}

export function registerTicketEditHandlers(): void {
  ipcMain.handle(
    'ticket:setBlocker',
    async (_event, rootPath: unknown, id: unknown, blocker: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
          throw new Error('A project, ticket, and revision are required.')
        }

        const project = await openProject(rootPath)
        await updateTicket(project, id, {
          expectedRevision: revision,
          blocker: parseBlocker(blocker),
        })
        return await buildView(project)
      }),
  )
}
