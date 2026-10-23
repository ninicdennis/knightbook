import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerDocumentHandlers } from './documents/documents-ipc.js'
import { registerProjectHandlers } from './ipc.js'
import { registerReviewChangesHandlers } from './documents/review-changes-ipc.js'
import { adoptStateFromPreviousName } from './project/app-state.js'
import { applyStoredColorScheme, registerSettingsHandlers } from './project/settings-ipc.js'
import { registerSetupHandlers } from './project/setup-ipc.js'
import { registerMcpAccessHandlers } from './mcp/mcp-access.js'
import { mcpLaunchCommand, mcpResourcesDir, NODE_BINARY } from './mcp/mcp-resources.js'
import { isAppImage, prepareAppImageRuntime } from './mcp/appimage-runtime.js'
import { applicationMenuTemplate, menuBarIsVisible } from './window/app-menu.js'
import { followSystemChanges, windowBackground } from './window/window-theme.js'
import {
  currentScheme,
  followThemeForTitleBars,
  followWindowFocus,
  titleBarOptions,
} from './window/title-bar.js'
import {
  finishSavingBeforeQuit,
  placementOptions,
  rememberedPlacement,
  rememberWindowPlacement,
} from './window/window-memory.js'
import type { WindowPlacement } from './window/window-placement.js'
import { PLAIN_WINDOW_TITLE } from './window/window-title.js'
import { registerWindowTitleHandler } from './window/window-title-ipc.js'
import { registerSkillSetupHandlers } from './mcp/skill-setup-ipc.js'
import { registerTicketFileHandler } from './tickets/ticket-file-ipc.js'
import { registerPlanHandlers } from './documents/plans-ipc.js'
import { registerPlanEditHandlers } from './documents/plan-edit-ipc.js'
import { registerRoutineHandlers } from './routines/routines-ipc.js'
import { registerTicketCreateHandler } from './tickets/ticket-create-ipc.js'
import { registerTicketEditHandlers } from './tickets/ticket-edit-ipc.js'
import { registerDocumentSearchHandler } from './documents/document-search-ipc.js'
import { registerImageHandler } from './documents/image-ipc.js'
import { registerDocumentCreateHandler } from './documents/document-create-ipc.js'

/**
 * Technical design section 1: the renderer receives narrow operations through
 * the host and never unrestricted filesystem or shell access. Document content
 * is untrusted input, so navigation and new windows driven by it are denied
 * outright rather than filtered.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const isDevelopment = !app.isPackaged

/*
 * Set before anything asks for a path, because `userData` is derived from it.
 * Left to itself Electron falls back to the `name` in package.json, which is a
 * scoped package name, and the state directory was literally
 * `%APPDATA%/@projectspace/desktop`. Naming the app here means the directory is
 * the product's name on every platform, in development and packaged alike,
 * rather than whichever field happened to win.
 */
app.setName('Knightbook')

function createWindow(placement: WindowPlacement): BrowserWindow {
  const window = new BrowserWindow({
    ...placementOptions(placement),
    title: PLAIN_WINDOW_TITLE,
    show: false,
    // Follows the user's colour-scheme setting, which is applied before this runs.
    backgroundColor: windowBackground(),
    ...titleBarOptions(process.platform, currentScheme()),
    webPreferences: {
      preload: join(HERE, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  /*
   * Hidden rather than absent: the menu built in `whenReady` still supplies the
   * edit accelerators, and leaving `autoHideMenuBar` off means Alt does not
   * bring the bar back. macOS has no per-window menu bar to hide.
   */
  if (!menuBarIsVisible(process.platform)) window.setMenuBarVisibility(false)
  followWindowFocus(window)

  window.once('ready-to-show', () => {
    if (placement.maximized) window.maximize()
    window.show()
  })
  rememberWindowPlacement(window)
  // The host owns the title (window-title-ipc.ts); a reload must not put the page's <title> back.
  window.on('page-title-updated', (event) => event.preventDefault())

  // Nothing in a project document may navigate the app or open a window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const isOwnPage = target.protocol === 'file:' || target.host === 'localhost:5173'
    if (!isOwnPage) {
      event.preventDefault()
      openExternalIfSafe(url)
    }
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (isDevelopment && devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(join(HERE, '..', 'renderer', 'index.html'))
  }

  return window
}

/** Only http and https, and only on an explicit user action. */
function openExternalIfSafe(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      void shell.openExternal(url)
    }
  } catch {
    // A malformed URL from document content is simply ignored.
  }
}

void app.whenReady().then(async () => {
  // Before any window, so no window is ever built around the default menu.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(applicationMenuTemplate({ platform: process.platform, isDevelopment })),
  )

  registerProjectHandlers()
  registerDocumentHandlers()
  registerReviewChangesHandlers()
  registerSetupHandlers()
  registerSettingsHandlers()
  registerMcpAccessHandlers()
  registerWindowTitleHandler()
  registerSkillSetupHandlers()
  registerTicketFileHandler()
  registerPlanHandlers()
  registerPlanEditHandlers()
  registerRoutineHandlers()
  registerTicketCreateHandler()
  registerTicketEditHandlers()
  registerDocumentSearchHandler()
  registerImageHandler()
  registerDocumentCreateHandler()
  process.stdout.write(`MCP launch command: ${JSON.stringify(mcpLaunchCommand())}\n`)

  /*
   * Before anything reads settings or the recent-project list: renaming the
   * product moved Electron's userData directory, and without this the first
   * launch after the rename would look like a first launch ever.
   */
  const adopted = await adoptStateFromPreviousName()
  if (adopted.outcome === 'adopted') {
    process.stdout.write(`Carried settings and recent projects over from ${adopted.from}\n`)
  } else if (adopted.outcome === 'failed') {
    process.stderr.write(
      `Could not carry state over from ${adopted.from}: ${adopted.reason}\n` +
        'Starting with defaults; the previous file was left untouched.\n',
    )
  }

  // After the carry-over above, which must see userData as it was. Not awaited:
  // the window does not need it, and the MCP panel waits for the outcome itself.
  if (isAppImage()) {
    void prepareAppImageRuntime(mcpResourcesDir(), app.getPath('userData'), NODE_BINARY).then(
      (problem) => {
        if (problem) process.stderr.write(`${problem}\n`)
      },
    )
  }

  // Before the first window, so it is not painted in the other scheme first.
  await applyStoredColorScheme()
  followSystemChanges()
  followThemeForTitleBars()
  finishSavingBeforeQuit()
  createWindow(await rememberedPlacement())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void rememberedPlacement().then(createWindow)
  })
})

app.on('window-all-closed', () => {
  // Closing the window does not affect MCP: the AI client owns that process.
  if (process.platform !== 'darwin') app.quit()
})
