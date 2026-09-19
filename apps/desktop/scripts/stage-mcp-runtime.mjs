import { chmod, copyFile, mkdir, rm, stat } from 'node:fs/promises'
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
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(HERE, '..')
const REPO_ROOT = join(APP_DIR, '..', '..')

const target = join(APP_DIR, 'resources', 'mcp')
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
const server = join(REPO_ROOT, 'packages', 'mcp', 'dist', 'server.mjs')

try {
  await stat(server)
} catch {
  console.error(`Bundled server is missing: ${server}\nRun "pnpm --filter @projectspace/mcp build" first.`)
  process.exit(1)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await copyFile(execPath, join(target, nodeName))
await copyFile(server, join(target, 'server.mjs'))

if (process.platform !== 'win32') {
  await chmod(join(target, nodeName), 0o755)
}

console.log(`Staged ${nodeName} and server.mjs into ${target}`)
console.log(`Built for ${process.platform}-${process.arch} only.`)
