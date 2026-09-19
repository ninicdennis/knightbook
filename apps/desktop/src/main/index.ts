import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerDocumentHandlers } from './documents-ipc.js'
import { registerProjectHandlers } from './ipc.js'
import { mcpLaunchCommand } from './mcp-resources.js'

/**
 * Technical design section 1: the renderer receives narrow operations through
 * the host and never unrestricted filesystem or shell access. Document content
 * is untrusted input, so navigation and new windows driven by it are denied
 * outright rather than filtered.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const isDevelopment = !app.isPackaged

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#14161a',
    webPreferences: {
      preload: join(HERE, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

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

void app.whenReady().then(() => {
  registerProjectHandlers()
  registerDocumentHandlers()
  process.stdout.write(`MCP launch command: ${JSON.stringify(mcpLaunchCommand('<project>'))}\n`)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Closing the window does not affect MCP: the AI client owns that process.
  if (process.platform !== 'darwin') app.quit()
})
