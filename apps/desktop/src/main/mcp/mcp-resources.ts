import { app } from 'electron'
import { join } from 'node:path'
import { accessRegistryPath } from './mcp-access.js'
import { isAppImage, persistentRuntimeDir } from './appimage-runtime.js'

/**
 * Where the shipped MCP runtime lives once installed. Technical design section 2
 * puts it in `extraResources`, outside the ASAR archive, so the AI client can
 * execute it directly.
 *
 * The command this builds is what the user copies into their client's config, so
 * it has to be a stable installed path. It must not point at a temporary
 * extraction directory: on Linux portable formats that path changes every run,
 * and a saved config would break.
 */

export const NODE_BINARY = process.platform === 'win32' ? 'node.exe' : 'node'

export function mcpResourcesDir(): string {
  // Unpackaged, this is the staging folder for this machine's CPU, which
  // `pnpm build` fills (scripts/stage-mcp-runtime.mjs).
  return app.isPackaged
    ? join(process.resourcesPath, 'mcp')
    : join(app.getAppPath(), 'resources', `mcp-${process.arch}`)
}

/**
 * Where the runtime the client is told to start lives. Under an AppImage the
 * resources folder disappears when the app closes, so it is the persistent copy
 * kept by appimage-runtime.ts instead.
 */
export function mcpRuntimeDir(env: NodeJS.ProcessEnv = process.env): string {
  return isAppImage(env) ? persistentRuntimeDir(app.getPath('userData')) : mcpResourcesDir()
}

export interface McpLaunchCommand {
  readonly command: string
  readonly args: string[]
}

/**
 * The one configuration a client needs for every project the user enables. It
 * names the access list rather than a project, so enabling another project later
 * changes nothing in the client.
 */
export function mcpLaunchCommand(env: NodeJS.ProcessEnv = process.env): McpLaunchCommand {
  const dir = mcpRuntimeDir(env)
  return {
    command: join(dir, NODE_BINARY),
    args: [join(dir, 'server.mjs'), '--registry', accessRegistryPath()],
  }
}
