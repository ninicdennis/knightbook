import { BrowserWindow, ipcMain } from 'electron'
import { windowTitleFor } from './window-title.js'

/** The title belongs to whichever window asked, so a second window could name its own project. */
export function registerWindowTitleHandler(): void {
  ipcMain.handle('window:showProjectInTitle', (event, project: unknown) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(windowTitleFor(project))
  })
}
