import { stat } from 'node:fs/promises'
import { readAccessRegistry, samePath, type AccessEntry } from './access-registry.js'
import { ProjectError, isProjectError } from './errors.js'
import { resolveProjectRoot } from './paths.js'
import { openProject, projectExists, type Project } from './project.js'

/**
 * Turns a checkout_id from an AI's tool call into an open project, or refuses.
 *
 * The registry is re-read on every call, so enabling or disabling a project in
 * the app reaches an already-running connection on its next operation without
 * the client reconnecting. The folder is then checked against what was enabled:
 * it must still exist at the same canonical path and still hold the same
 * project. A folder that moved is reported, never rebound to another checkout
 * that happens to share the project UUID or name — clones and worktrees share
 * both, and picking one of them would be a guess about where the AI should write.
 *
 * Revocation is checked here, before the operation starts. An operation already
 * past this point finishes; project writes replace files through a temporary
 * file, so finishing cannot leave one half-written.
 */

export interface ResolvedCheckout {
  readonly checkoutId: string
  readonly project: Project
}

export async function resolveEnabledCheckout(
  registryPath: string,
  checkoutId: string,
): Promise<ResolvedCheckout> {
  const registry = await readAccessRegistry(registryPath)
  const entry = registry.checkouts.find((candidate) => candidate.checkout_id === checkoutId)
  if (!entry) {
    throw new ProjectError(
      'checkout_not_enabled',
      `No enabled project has checkout_id ${checkoutId}. It may never have been enabled, or ` +
        'the user turned off AI access for it. Call projects_list for the current ids.',
    )
  }

  const problem = await checkoutProblem(entry)
  if (problem) throw problem
  return { checkoutId, project: await openProject(entry.path) }
}

/** What projects_list reports for one enabled checkout. */
export interface EnabledCheckout {
  readonly checkoutId: string
  readonly projectId: string
  /** The current name when the project could be read, otherwise the name when enabled. */
  readonly name: string
  readonly checkoutPath: string
  readonly available: boolean
  /** Why it cannot be used right now, in words to repeat to the user. */
  readonly unavailableReason: string | null
  /** Other enabled checkouts of the same project: clones or worktrees, told apart by path. */
  readonly sameProjectAs: string[]
}

export async function describeEnabledCheckouts(registryPath: string): Promise<EnabledCheckout[]> {
  const { checkouts } = await readAccessRegistry(registryPath)
  return await Promise.all(
    checkouts.map(async (entry) => {
      const problem = await checkoutProblem(entry)
      const name = problem ? entry.name : await currentName(entry)
      return {
        checkoutId: entry.checkout_id,
        projectId: entry.project_id,
        name,
        checkoutPath: entry.path,
        available: problem === null,
        unavailableReason: problem?.message ?? null,
        sameProjectAs: checkouts
          .filter((other) => other !== entry && other.project_id === entry.project_id)
          .map((other) => other.checkout_id),
      }
    }),
  )
}

/** The enabled checkout for a folder, if it has one. Used by the desktop to show the setting. */
export async function findEnabledCheckout(
  registryPath: string,
  checkoutPath: string,
): Promise<AccessEntry | null> {
  const { checkouts } = await readAccessRegistry(registryPath)
  return checkouts.find((entry) => samePath(entry.path, checkoutPath)) ?? null
}

async function checkoutProblem(entry: AccessEntry): Promise<ProjectError | null> {
  try {
    if (!(await stat(entry.path)).isDirectory()) {
      return unavailable(entry, 'is no longer a folder')
    }
  } catch {
    return unavailable(entry, 'was not found. It may have been moved, renamed, or deleted')
  }

  const root = await resolveProjectRoot(entry.path)
  if (!samePath(root.path, entry.path)) {
    return new ProjectError(
      'checkout_mismatch',
      `${entry.path} now resolves to ${root.path}, so it is not the folder that was enabled. ` +
        'Ask the user to enable the folder they mean in the Knightbook app.',
    )
  }
  if (!(await projectExists(root))) {
    return unavailable(entry, 'no longer has project records. It can be set up again in the app')
  }

  try {
    const project = await openProject(root.path)
    if (project.frontmatter.id !== entry.project_id) {
      return new ProjectError(
        'checkout_mismatch',
        `${entry.path} now holds a different project (${project.frontmatter.name}, ` +
          `${project.frontmatter.id}) from the one enabled (${entry.name}, ${entry.project_id}). ` +
          'Ask the user to enable it again in the Knightbook app if that is intended.',
      )
    }
  } catch (error) {
    // Without a readable project.md the folder's identity cannot be confirmed,
    // and an unconfirmed folder is not the one the user enabled.
    if (!isProjectError(error)) throw error
    return unavailable(entry, `has project records that could not be read (${error.message})`)
  }
  return null
}

async function currentName(entry: AccessEntry): Promise<string> {
  try {
    return (await openProject(entry.path)).frontmatter.name
  } catch {
    return entry.name
  }
}

function unavailable(entry: AccessEntry, what: string): ProjectError {
  return new ProjectError(
    'checkout_unavailable',
    `The enabled folder for ${entry.name}, ${entry.path}, ${what}. ` +
      'It is not redirected to any other folder; the user can enable the new location in the app.',
  )
}
