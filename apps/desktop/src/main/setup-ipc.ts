import { ipcMain } from 'electron'
import { guard } from './guard.js'
import { inspectFolder, setUpFolder } from './folder-setup.js'
import { allowSetupFor, assertAwaitingSetup } from './setup-permit.js'
import type { FolderInspection, SetupOutcome } from '../shared/contract.js'

export function registerSetupHandlers(): void {
  ipcMain.handle(
    'project:inspectFolder',
    async (_event, path: unknown) =>
      await guard<FolderInspection>(async () => await inspectFolder(assertAwaitingSetup(path))),
  )

  ipcMain.handle(
    'project:setUp',
    async (_event, path: unknown, name: unknown, include: unknown) =>
      await guard<SetupOutcome>(async () => {
        const target = assertAwaitingSetup(path)
        if (typeof name !== 'string' || !Array.isArray(include)) {
          throw new Error('A name and a list of documents to include are required.')
        }
        const outcome = await setUpFolder(target, {
          name,
          include: include.filter((entry): entry is string => typeof entry === 'string'),
        })
        allowSetupFor(null)
        return outcome
      }),
  )
}
