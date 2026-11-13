import { app, BrowserWindow, ipcMain, net } from 'electron'
import electronUpdater from 'electron-updater'
import { appStateChangesSettled } from '../project/app-state.js'
import { mcpResourcesDir } from '../mcp/mcp-resources.js'
import { heldFilesSync } from './held-files.js'
import { RELEASES_URL, updateMode } from './release-feed.js'
import { UpdateService, type InPlaceUpdater } from './update-service.js'

/**
 * In-app updates as built (D-056): the update service wired to GitHub Releases,
 * electron-updater on Windows, the window, and the quit sequence.
 *
 * The app checks a few seconds after it opens and every six hours while it stays
 * open, and the user can check from Settings. Finding a version only says so;
 * nothing is downloaded until the user asks.
 */

const FIRST_CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000

async function fetchReleases(): Promise<unknown> {
  const response = await net.fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Knightbook-updater' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const limited = response.status === 403 || response.status === 429
    throw new Error(
      limited
        ? 'GitHub is limiting requests from this network for now; try again later'
        : `GitHub answered ${response.status}`,
    )
  }
  return await response.json()
}

/**
 * electron-updater's Windows updater, pointed at one release at a time. The
 * release is chosen by our own check (release-feed.ts), so a withdrawn release is
 * skipped; electron-updater reads that release's latest.yml, downloads the
 * installer and refuses one whose SHA-512 does not match it.
 */
function windowsUpdater(): InPlaceUpdater {
  const updater = new electronUpdater.NsisUpdater()
  updater.autoDownload = false
  updater.allowDowngrade = false
  // Read when the app quits; the service turns it off while files are in use.
  updater.autoInstallOnAppQuit = true
  let progress: ((percent: number) => void) | undefined
  updater.on('download-progress', (info: { percent: number }) => progress?.(info.percent))

  return {
    async prepare(downloadBase) {
      updater.setFeedURL({ provider: 'generic', url: downloadBase })
      const result = await updater.checkForUpdates()
      return result?.updateInfo.version ?? null
    },
    async download(onProgress) {
      progress = onProgress
      try {
        await updater.downloadUpdate()
      } finally {
        progress = undefined
      }
    },
    // Silent, then reopen: the user already chose to restart.
    quitAndInstall: () => updater.quitAndInstall(true, true),
    setInstallOnQuit(enabled) {
      updater.autoInstallOnAppQuit = enabled
    },
  }
}

export function registerUpdateHandlers(): void {
  const mode = updateMode(process.platform, app.isPackaged, app.getVersion())
  const service = new UpdateService({
    currentVersion: app.getVersion(),
    mode,
    fetchReleases,
    updater: mode === 'install' ? windowsUpdater() : null,
    heldFiles: () => heldFilesSync(mcpResourcesDir()),
    settleSaves: appStateChangesSettled,
  })

  service.onChange((view) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('update:changed', view)
    }
  })

  ipcMain.handle('update:view', () => service.view())
  ipcMain.handle('update:check', async () => await service.check())
  ipcMain.handle('update:download', async () => await service.download())
  ipcMain.handle('update:install', async () => await service.install())

  app.on('will-quit', () => service.beforeQuit())

  if (mode === 'off') return
  const timer = setTimeout(() => {
    void service.check()
    setInterval(() => void service.check(), CHECK_INTERVAL_MS).unref()
  }, FIRST_CHECK_DELAY_MS)
  timer.unref()
}
