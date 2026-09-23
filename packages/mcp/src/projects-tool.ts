import { describeEnabledCheckouts } from '@knightbook/core'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { guard, ok } from './result.js'

/**
 * The one tool on a shared connection that is not about a single project: what
 * the user has enabled, and how to tell the entries apart.
 *
 * Two clones or worktrees of one project have the same project id and usually
 * the same name, so the checkout path is what distinguishes them, and each gets
 * its own checkout_id. A folder that moved or lost its records is listed with the
 * reason rather than dropped, so the AI can tell the user instead of quietly
 * picking another checkout of the same project.
 */
export function registerProjectsTool(server: McpServer, registryPath: string): void {
  server.registerTool(
    'projects_list',
    {
      title: 'List enabled projects',
      description:
        'Every project checkout the user has enabled for AI access in the Knightbook app, ' +
        'with the checkout_id each project tool requires. Clones and worktrees of one ' +
        'project share a project_id and often a name; tell them apart by checkout_path. ' +
        'If more than one could be meant, ask the user which. Do not guess.',
      inputSchema: z.object({}),
    },
    async () =>
      await guard(async () => {
        const checkouts = await describeEnabledCheckouts(registryPath)
        return ok({
          projects: checkouts.map((checkout) => ({
            checkout_id: checkout.checkoutId,
            project_id: checkout.projectId,
            name: checkout.name,
            checkout_path: checkout.checkoutPath,
            available: checkout.available,
            unavailable_reason: checkout.unavailableReason,
            same_project_as: checkout.sameProjectAs,
          })),
          note:
            checkouts.length === 0
              ? 'No project is enabled. The user can turn on AI access for a project in the ' +
                'Knightbook app, in the MCP panel at the bottom of the window.'
              : undefined,
        })
      }),
  )
}
