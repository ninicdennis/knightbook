import { closeSync, openSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Files under `directory` that another process holds open, on Windows.
 *
 * An AI client starts the bundled MCP server from the installed `resources/mcp`
 * folder and keeps it running whether or not the window is open (D-008). While
 * it runs, Windows refuses to replace `node.exe`, and an installer started then
 * would fail part way. The app never stops that process, since it belongs to the
 * client; it finds the held files and asks the user to close the client instead.
 *
 * Opening each file for writing without truncating is the probe the packaging
 * guard uses (scripts/release-lock-guard.mjs): a running executable refuses it,
 * and it changes nothing, not even the modification time. Synchronous because it
 * also runs while the app quits, when nothing can be awaited. macOS and Linux
 * let a running file be replaced, so there it reports nothing.
 */

const HELD = new Set(['EBUSY', 'EPERM', 'EACCES'])

export function heldFilesSync(directory: string, platform = process.platform): string[] {
  if (platform !== 'win32') return []
  const held: string[] = []
  for (const path of filesUnder(directory)) {
    try {
      closeSync(openSync(path, 'r+'))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (!HELD.has(code)) throw error
      held.push(relative(directory, path).split('\\').join('/'))
    }
  }
  return held
}

function* filesUnder(directory: string): Generator<string> {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* filesUnder(path)
    else if (entry.isFile()) yield path
  }
}
