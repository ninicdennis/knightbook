import { createReadStream } from 'node:fs'
import { chmod, copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Places the Node runtime and the bundled MCP server where electron-builder's
 * `extraResources` entry expects them.
 *
 * This copies the Node running the build, which is only correct when building
 * for the host platform. A real cross-platform release has to download the
 * matching runtime for each target instead; that is a release task, and this
 * script is deliberately explicit about the limitation rather than hiding it.
 *
 * Nothing already staged is replaced unless it differs. On a development machine
 * an AI client usually has the MCP server running from this very directory, and
 * Windows will not let a running executable be deleted or overwritten. Re-copying
 * an identical 90 MB runtime achieved nothing and failed the whole build.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(HERE, '..')
const REPO_ROOT = join(APP_DIR, '..', '..')

const target = join(APP_DIR, 'resources', 'mcp')
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
const server = join(REPO_ROOT, 'packages', 'mcp', 'dist', 'server.mjs')

/** A file being in use, which on Windows is how a running executable reports. */
const IN_USE = new Set(['EPERM', 'EBUSY', 'EACCES', 'ETXTBSY'])

async function sizeOf(path) {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/**
 * Compares sizes before hashing: the staged runtime is usually identical, and
 * the sizes settle that as soon as it is not.
 */
async function isAlreadyStaged(source, staged) {
  const stagedSize = await sizeOf(staged)
  if (stagedSize === null || stagedSize !== (await sizeOf(source))) return false
  return (await sha256(source)) === (await sha256(staged))
}

function explainInUse(staged) {
  const finder =
    process.platform === 'win32'
      ? `  Get-CimInstance Win32_Process | Where-Object ExecutablePath -eq '${staged}'`
      : `  lsof '${staged}'`

  return [
    `Could not replace the staged file: ${staged}`,
    '',
    'It is in use, and it differs from what this build would stage, so the build',
    'cannot continue. The usual cause is an AI client running the Projectspace MCP',
    'server from this directory; an operating system will not overwrite a running',
    'executable.',
    '',
    'Close that client, or stop its Projectspace server, and build again.',
    'To see what is holding it:',
    finder,
  ].join('\n')
}

/** Copies only what changed, and explains a file that is held open. */
async function stage(source, name) {
  const staged = join(target, name)
  if (await isAlreadyStaged(source, staged)) {
    return `kept ${name} (already identical)`
  }

  try {
    await copyFile(source, staged)
    return `staged ${name}`
  } catch (error) {
    if (IN_USE.has(error.code)) {
      console.error(explainInUse(staged))
      process.exit(1)
    }
    throw error
  }
}

/**
 * Leftovers from a build for another platform are still removed, which is what
 * the previous wholesale delete was for. The runtime for this platform is not
 * touched here: `stage` decides whether it needs replacing at all.
 */
async function removeStrays() {
  const keep = new Set([nodeName, 'server.mjs'])
  let entries
  try {
    entries = await readdir(target)
  } catch {
    return []
  }

  const removed = []
  for (const entry of entries) {
    if (keep.has(entry)) continue
    await rm(join(target, entry), { recursive: true, force: true })
    removed.push(entry)
  }
  return removed
}

try {
  await stat(server)
} catch {
  console.error(
    `Bundled server is missing: ${server}\nRun "pnpm --filter @projectspace/mcp build" first.`,
  )
  process.exit(1)
}

await mkdir(target, { recursive: true })

const strays = await removeStrays()
if (strays.length > 0) console.log(`Removed from an earlier build: ${strays.join(', ')}`)

const results = [await stage(execPath, nodeName), await stage(server, 'server.mjs')]

if (process.platform !== 'win32') {
  await chmod(join(target, nodeName), 0o755)
}

console.log(`${results.join(', ')} in ${target}`)
console.log(`Built for ${process.platform}-${process.arch} only.`)
