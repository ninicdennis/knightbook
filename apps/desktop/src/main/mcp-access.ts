import { app, ipcMain } from 'electron'
import {
  grantCheckoutAccess,
  openProject,
  resolveProjectRoot,
  revokeCheckoutAccess,
} from '@knightbook/core'
import { join } from 'node:path'
import { guard } from './guard.js'
import { readMcpAccess } from './mcp-status.js'
import type { McpAccessView } from '../shared/contract.js'

/**
 * The per-project "Allow AI access through MCP" setting.
 *
 * The grants live in their own file in the app's user-data folder, beside but
 * separate from the recent-project list: that list is a disposable convenience,
 * and this one decides what an AI can reach. Opening a folder, or having it in
 * recent projects, never adds it here; only the user turning the setting on does.
 *
 * The copied MCP configuration points the server at this file, so it has to stay
 * at the same path across launches and updates, which userData does.
 */

export function accessRegistryPath(): string {
  return join(app.getPath('userData'), 'mcp-access.json')
}

/**
 * Enabling needs a readable project, so its identity is recorded with the grant.
 * Disabling needs nothing but the path: turning access off must still work when
 * the project's own records are broken.
 */
async function setMcpAccess(checkoutPath: string, enabled: boolean): Promise<McpAccessView> {
  if (!enabled) {
    const root = await resolveProjectRoot(checkoutPath)
    await revokeCheckoutAccess(accessRegistryPath(), root.path)
    return await readMcpAccess(accessRegistryPath(), root.path)
  }
  const project = await openProject(checkoutPath)
  await grantCheckoutAccess(accessRegistryPath(), {
    path: project.root.path,
    projectId: project.frontmatter.id,
    name: project.frontmatter.name,
  })
  return await readMcpAccess(accessRegistryPath(), project.root.path)
}

export function registerMcpAccessHandlers(): void {
  ipcMain.handle(
    'mcp:setAccess',
    async (_event, checkoutPath: unknown, enabled: unknown) =>
      await guard<McpAccessView>(async () => {
        if (typeof checkoutPath !== 'string' || typeof enabled !== 'boolean') {
          throw new Error('A project path and an on/off choice are required.')
        }
        return await setMcpAccess(checkoutPath, enabled)
      }),
  )
}
