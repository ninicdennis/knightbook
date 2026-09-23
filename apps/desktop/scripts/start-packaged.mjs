import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Opens the app that `pnpm pack:dir` left in `release/`, so trying a packaged
 * build does not mean digging through the output folder for the executable.
 *
 * It launches exactly what a user would double-click and nothing is rebuilt:
 * running a stale package by accident is the failure this has to make visible,
 * so the path and its build time are printed before it starts.
 *
 * The binary is discovered with the same rules the packaging tests use
 * (experiments/packaging/src/packaged.ts) rather than spelled out, because the
 * product name has already changed once and left a hard-coded path pointing at
 * nothing.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
export const RELEASE_DIR = join(HERE, '..', 'release')

/** Helpers Electron and electron-builder leave beside the app; none is the product. */
const NOT_THE_APP = new Set(['chrome-sandbox', 'chrome_crashpad_handler', 'LICENSE', 'version'])

/** The one launchable binary in a Windows or Linux layout, or null when it is not obvious. */
async function launchableBinaryIn(directory, platform) {
  const launchable = []
  for (const entry of await readdir(directory).catch(() => [])) {
    if (NOT_THE_APP.has(entry)) continue
    if (platform === 'win32') {
      if (entry.endsWith('.exe')) launchable.push(entry)
      continue
    }
    // `resources` and `locales` have no extension either, so only files count.
    if (entry.includes('.')) continue
    const info = await stat(join(directory, entry)).catch(() => null)
    if (info?.isFile()) launchable.push(entry)
  }
  return launchable.length === 1 ? join(directory, launchable[0]) : null
}

/**
 * What to start for this platform: a binary on Windows and Linux, the `.app`
 * bundle on macOS (opened through `open`, as Finder would). Null when nothing
 * packaged is there.
 */
export async function findPackagedApp(releaseDir = RELEASE_DIR, platform = process.platform) {
  if (platform === 'darwin') {
    for (const output of await readdir(releaseDir).catch(() => [])) {
      if (!output.startsWith('mac')) continue
      for (const entry of await readdir(join(releaseDir, output)).catch(() => [])) {
        if (entry.endsWith('.app')) return { kind: 'bundle', path: join(releaseDir, output, entry) }
      }
    }
    return null
  }

  const layout = platform === 'win32' ? 'win-unpacked' : 'linux-unpacked'
  const binary = await launchableBinaryIn(join(releaseDir, layout), platform)
  return binary ? { kind: 'binary', path: binary } : null
}

async function main() {
  const app = await findPackagedApp()
  if (!app) {
    process.stderr.write(
      `No packaged app found under ${RELEASE_DIR}.\n` + 'Build one first with: pnpm pack:dir\n',
    )
    process.exit(1)
  }

  const builtAt = (await stat(app.path)).mtime
  process.stdout.write(`Starting ${app.path}\n(packaged ${builtAt.toLocaleString()})\n`)

  // Detached and unreferenced, so the terminal is handed back while the app runs.
  const child =
    app.kind === 'bundle'
      ? spawn('open', [app.path], { detached: true, stdio: 'ignore' })
      : spawn(app.path, [], { detached: true, stdio: 'ignore' })
  child.on('error', (error) => {
    process.stderr.write(`Could not start it: ${error.message}\n`)
    process.exit(1)
  })
  child.unref()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
