import { ipcMain, shell } from 'electron'
import { listPlanRecords, listTicketRecords, openProject } from '@knightbook/core'
import type { PlansView } from '../../shared/plans-contract.js'
import { guard } from '../guard.js'
import { toPlansView } from './plan-view.js'
import { planFileToOpen } from '../tickets/ticket-file.js'

/**
 * Reading plans for the Plans pane. The window only reads them for now; plans
 * are written through MCP or in the user's own editor, like documents.
 */
export function registerPlanHandlers(): void {
  ipcMain.handle(
    'plans:list',
    async (_event, rootPath: unknown) =>
      await guard<PlansView>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        const project = await openProject(rootPath)
        const [plans, tickets] = await Promise.all([
          listPlanRecords(project),
          listTicketRecords(project),
        ])
        return toPlansView(plans, tickets)
      }),
  )

  ipcMain.handle(
    'plan:openExternally',
    async (_event, rootPath: unknown, id: unknown) =>
      await guard<null>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        const path = await planFileToOpen(await openProject(rootPath), id)
        const failure = await shell.openPath(path)
        if (failure) throw new Error(`Your editor could not open the plan file: ${failure}`)
        return null
      }),
  )
}
