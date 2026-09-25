import { ipcMain, shell } from 'electron'
import { openProject } from '@knightbook/core'
import { guard } from './guard.js'
import { ticketFileToOpen } from './ticket-file.js'

/**
 * Hands a ticket's Markdown file to the user's own editor, as
 * `document:openExternally` does for documents. `openPath` opens with the
 * registered handler rather than executing anything, and a failure it reports
 * comes back as an error so the window never looks like it worked.
 */
export function registerTicketFileHandler(): void {
  ipcMain.handle(
    'ticket:openExternally',
    async (_event, rootPath: unknown, id: unknown) =>
      await guard<null>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        const path = await ticketFileToOpen(await openProject(rootPath), id)
        const failure = await shell.openPath(path)
        if (failure) throw new Error(`Your editor could not open the ticket file: ${failure}`)
        return null
      }),
  )
}
