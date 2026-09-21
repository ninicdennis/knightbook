import { chmod, copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  archiveFor,
  ensureRuntime,
  hostProvides,
  NODE_VERSION,
  resolveTarget,
  sha256,
} from './node-runtime.mjs'

/**
 * Places the Node runtime and the bundled MCP server where electron-builder's
 * `extraResources` entry expects them.
 *
 * The runtime staged is the one that matches the target being built, not the
 * one running this script. `--platform` and `--arch` name that target and
 * default to this machine; `node-runtime.mjs` supplies the binary, downloading
 * and checksumming it when the host cannot provide it itself.
 *
 * Nothing already staged is replaced unless it differs. On a development machine
 * an AI client usually has the MCP server running from this very directory, and
 * Windows will not let a running executable be deleted or overwritten. Re-copying
 * an identical 90 MB runtime achieved nothing and failed the whole build.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(HERE, '..')
const REPO_ROOT = join(APP_DIR, '..', '..')

const server = join(REPO_ROOT, 'packages', 'mcp', 'dist', 'server.mjs')

/** Downloads land here, under node_modules so they are already ignored by Git. */
const CACHE = join(APP_DIR, 'node_modules', '.cache', 'knightbook-runtimes')

function option(argv, name) {
  const match = argv.find((arg) => arg.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : undefined
}

const args = process.argv.slice(2)

/**
 * `--platform=darwin --arch=arm64`, or this machine when neither is given, and
 * `--out` for a directory other than the one electron-builder installs from.
 * A cross-target stage clears the runtime for the platform it replaces, so
 * checking one without disturbing a working resources directory needs `--out`.
 */
/** A target this project does not build is a mistake in the command, not a crash. */
function targetOrExit() {
  try {
    return resolveTarget(
      option(args, 'platform') ?? process.platform,
      option(args, 'arch') ?? process.arch,
    )
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

const buildTarget = targetOrExit()
const target = option(args, 'out') ?? join(APP_DIR, 'resources', 'mcp')
const runtime = archiveFor(buildTarget)
const nodeName = runtime.binaryName

/** A file being in use, which on Windows is how a running executable reports. */
const IN_USE = new Set(['EPERM', 'EBUSY', 'EACCES', 'ETXTBSY'])

async function sizeOf(path) {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
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
    'cannot continue. The usual cause is an AI client running the Knightbook MCP',
    'server from this directory; an operating system will not overwrite a running',
    'executable.',
    '',
    'Close that client, or stop its Knightbook server, and build again.',
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
    `Bundled server is missing: ${server}\nRun "pnpm --filter @knightbook/mcp build" first.`,
  )
  process.exit(1)
}

await mkdir(target, { recursive: true })

const strays = await removeStrays()
if (strays.length > 0) console.log(`Removed from an earlier build: ${strays.join(', ')}`)

/*
 * The build host's own Node is used only when it is the same platform, CPU and
 * version as the runtime this project ships. Anything else is fetched for the
 * target, so a macOS arm64 release is never a copy of the Linux x64 Node that
 * built it.
 */
const source = hostProvides(buildTarget)
  ? execPath
  : await ensureRuntime({ target: buildTarget, cacheDir: CACHE, log: (line) => console.log(line) })

const results = [await stage(source, nodeName), await stage(server, 'server.mjs')]

/*
 * Set on the staged copy as well: copyFile carries the mode on POSIX, but a
 * binary just unpacked from a zip never had one to carry.
 *
 * On Windows this call does nothing that survives. NTFS has no executable bit,
 * so a Linux or macOS runtime staged here is packaged without one and the
 * installed application cannot start its own server. Each target is built on
 * its own runner in CI, so this is a warning about a cross-build a person ran
 * by hand rather than something the release path depends on.
 */
if (buildTarget.platform !== 'win32') {
  await chmod(join(target, nodeName), 0o755)

  if (process.platform === 'win32') {
    console.warn(
      `\nWarning: staged a ${buildTarget.key} runtime on Windows.\n` +
        'NTFS cannot record the executable bit, so this staging directory is not\n' +
        `fit to package. Build the ${buildTarget.platform} target on ${buildTarget.platform}.`,
    )
  }
}

console.log(`${results.join(', ')} in ${target}`)
console.log(
  `Staged Node ${hostProvides(buildTarget) ? process.versions.node : NODE_VERSION} ` +
    `for ${buildTarget.key}${source === execPath ? ', from this build host' : ''}.`,
)
