import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerDocumentHandlers } from './documents-ipc.js'
import { registerProjectHandlers } from './ipc.js'
import { adoptStateFromPreviousName } from './app-state.js'
import { applyStoredColorScheme, registerSettingsHandlers } from './settings-ipc.js'
import { registerSetupHandlers } from './setup-ipc.js'
import { mcpLaunchCommand } from './mcp-resources.js'
import { applicationMenuTemplate, menuBarIsVisible } from './app-menu.js'
import { followSystemChanges, windowBackground } from './window-theme.js'

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

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    // Follows the user's colour-scheme setting, which is applied before this runs.
    backgroundColor: windowBackground(),
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

  window.once('ready-to-show', () => window.show())

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
  registerSetupHandlers()
  registerSettingsHandlers()
  process.stdout.write(`MCP launch command: ${JSON.stringify(mcpLaunchCommand('<project>'))}\n`)

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

  // Before the first window, so it is not painted in the other scheme first.
  await applyStoredColorScheme()
  followSystemChanges()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Closing the window does not affect MCP: the AI client owns that process.
  if (process.platform !== 'darwin') app.quit()
})
