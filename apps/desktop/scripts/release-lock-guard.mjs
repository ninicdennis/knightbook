import { open, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Stops `pnpm pack:dir` before electron-builder touches `release/win-unpacked`
 * while something is running from it.
 *
 * electron-builder empties its output folder before writing the new package.
 * On Windows it can delete every file that is not in use and then fail on the
 * first one that is, which left the packaged app half-deleted: locales, `.pak`
 * files and the bundled MCP runtime gone, the running exe and a few DLLs still
 * there. An AI client configured to run that MCP runtime then had nothing to run.
 *
 * Renaming the folder is not a usable probe, because Windows allows it even with
 * an executable inside running. Opening each file for writing is: a running
 * executable or loaded DLL refuses it, and opening without truncating changes
 * nothing, not even the modification time.
 *
 * Only Windows needs this. macOS and Linux let a running file be deleted, so the
 * old package is replaced cleanly and the running copy keeps its open files.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const RELEASE_DIR = join(HERE, '..', 'release')

/** How Windows reports a file another process holds, or one that cannot be written. */
const HELD = new Set(['EBUSY', 'EPERM', 'EACCES'])

async function* filesUnder(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* filesUnder(path)
    else if (entry.isFile()) yield path
  }
}

/** Project-relative paths of the files under `directory` that cannot be opened for writing. */
export async function heldFiles(directory) {
  const held = []
  for await (const path of filesUnder(directory)) {
    try {
      const handle = await open(path, 'r+')
      await handle.close()
    } catch (error) {
      if (!HELD.has(error.code)) throw error
      held.push(relative(directory, path).split('\\').join('/'))
    }
  }
  return held
}

/** The message for a refused pack, or null when packaging can go ahead. */
export async function checkReleaseDir(releaseDir = RELEASE_DIR, platform = process.platform) {
  if (platform !== 'win32') return null
  const output = join(releaseDir, 'win-unpacked')
  const held = await heldFiles(output)
  if (held.length === 0) return null

  const shown = held.slice(0, 5).map((path) => `  ${path}`)
  if (held.length > shown.length) shown.push(`  …and ${held.length - shown.length} more`)
  return [
    `Not packaging: files in ${output} are in use.`,
    '',
    ...shown,
    '',
    'Something is running from the packaged app: usually Knightbook itself, or an AI',
    'client running the MCP server from its resources/mcp folder. Packaging now would',
    'delete everything else in that folder and then fail, leaving it half-removed.',
    'Nothing has been changed. Close the app (and stop that MCP server), then run',
    'pnpm pack:dir again.',
  ].join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const refusal = await checkReleaseDir()
  if (refusal) {
    process.stderr.write(`${refusal}\n`)
    process.exit(1)
  }
}
