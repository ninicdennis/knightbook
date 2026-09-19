import { copyFile, mkdir, rm } from 'node:fs/promises'
import { execPath } from 'node:process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Builds the resource layout that electron-builder's `extraResources` would
 * install: a platform-specific Node runtime beside the bundled server, outside
 * the ASAR archive, at a path the AI client saves in its own configuration.
 *
 * Staging it here rather than running a full installer keeps the experiment
 * about the thing in question — whether a client can start the server with no
 * system Node and no running GUI — instead of about installer plumbing.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = join(HERE, '..', '..', '..')

export interface StagedResources {
  /** The directory an installed app would expose as its resources path. */
  readonly resourcesDir: string
  /** Absolute path to the shipped Node runtime, as the client config names it. */
  readonly nodePath: string
  /** Absolute path to the bundled server entry point. */
  readonly serverPath: string
}

const NODE_BINARY = process.platform === 'win32' ? 'node.exe' : 'node'

export async function stageResources(destination: string): Promise<StagedResources> {
  const mcpDir = join(destination, 'mcp')
  await rm(destination, { recursive: true, force: true })
  await mkdir(mcpDir, { recursive: true })

  const nodePath = join(mcpDir, NODE_BINARY)
  const serverPath = join(mcpDir, 'server.mjs')

  // The runtime we ship is a copy, not a reference to whatever Node the user has.
  await copyFile(execPath, nodePath)
  await copyFile(join(REPO_ROOT, 'packages', 'mcp', 'dist', 'server.mjs'), serverPath)

  return { resourcesDir: destination, nodePath, serverPath }
}

/**
 * The environment a client process would hand the server, with every Node
 * installation removed from PATH. If the server still starts, it is genuinely
 * running on the runtime we shipped.
 */
export function environmentWithoutNode(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (/^(NODE_|npm_|PNPM_|VITEST|fnm)/i.test(key)) continue
    env[key] = value
  }

  const separator = process.platform === 'win32' ? ';' : ':'
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
  const cleaned = (env[pathKey] ?? '')
    .split(separator)
    .filter((entry) => entry.length > 0 && !/node|fnm|nvm|pnpm|volta/i.test(entry))
  env[pathKey] = cleaned.join(separator)

  return env
}
