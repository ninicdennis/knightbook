import { openProject, resolveEnabledCheckout, type Project } from '@knightbook/core'
import { z } from 'zod'
import type { LaunchMode } from './launch-mode.js'

/**
 * How a project tool finds the project it acts on. Every tool goes through this,
 * so the two kinds of connection differ in one place rather than in each tool.
 *
 * A root-bound connection has one project and no target argument. A shared
 * connection takes `checkout_id` on every call and resolves it against the
 * access registry fresh each time. There is deliberately no "current project"
 * anywhere in the process: concurrent calls from one client, or from several
 * chats sharing a process, each carry their own target and cannot redirect one
 * another. The desktop's visible project plays no part either.
 */

export interface ProjectScope {
  /** The single folder a root-bound connection serves, or null for a shared one. */
  readonly boundRoot: string | null
  /** Extra input fields every project tool takes. */
  readonly shape: z.ZodRawShape
  /** Opens the target project, checking access first. */
  open(input: object): Promise<Project>
  /**
   * Adds the target's identity to a response on a shared connection, so the
   * caller can confirm where it acted. A root-bound response is unchanged.
   */
  echo(project: Project, input: object, value: object): object
}

export const CHECKOUT_ID_DESCRIPTION =
  'The checkout to act on, from projects_list. Required on every call; if more than one ' +
  'project could be meant, ask the user which rather than guessing.'

export function createScope(mode: LaunchMode, onUse: (project: Project) => void): ProjectScope {
  if (mode.kind === 'single') {
    return {
      boundRoot: mode.root,
      shape: {},
      open: async () => await openProject(mode.root),
      echo: (_project, _input, value) => value,
    }
  }

  return {
    boundRoot: null,
    shape: { checkout_id: z.string().min(1).describe(CHECKOUT_ID_DESCRIPTION) },
    open: async (input) => {
      const { project } = await resolveEnabledCheckout(mode.registry, checkoutIdOf(input))
      onUse(project)
      return project
    },
    echo: (project, input, value) => ({
      project: {
        checkout_id: checkoutIdOf(input),
        project_id: project.frontmatter.id,
        name: project.frontmatter.name,
        checkout_path: project.root.path,
      },
      ...value,
    }),
  }
}

function checkoutIdOf(input: object): string {
  const { checkout_id: checkoutId } = input as { checkout_id?: unknown }
  // The schema already requires it; this guards a caller that bypassed validation.
  if (typeof checkoutId !== 'string' || checkoutId.length === 0) {
    throw new Error('checkout_id is required. Call projects_list to find it.')
  }
  return checkoutId
}
