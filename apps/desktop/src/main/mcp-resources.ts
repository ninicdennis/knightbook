import { app } from 'electron'
import { join } from 'node:path'

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
  return app.isPackaged
    ? join(process.resourcesPath, 'mcp')
    : join(app.getAppPath(), 'resources', 'mcp')
}

export interface McpLaunchCommand {
  readonly command: string
  readonly args: string[]
}

export function mcpLaunchCommand(projectRoot: string): McpLaunchCommand {
  const dir = mcpResourcesDir()
  return {
    command: join(dir, NODE_BINARY),
    args: [join(dir, 'server.mjs'), '--root', projectRoot],
  }
}
