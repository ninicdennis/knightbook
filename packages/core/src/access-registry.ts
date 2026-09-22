import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { ProjectError } from './errors.js'
import { acquireFileLock } from './write.js'

/**
 * The list of checkouts the user has explicitly allowed AI clients to reach
 * through the shared MCP connection.
 *
 * It is a grant list, not a convenience list, which is why it is kept apart from
 * the desktop's recent projects: that list is capped, evicts, and swallows write
 * failures, and any of those would silently change what an AI can reach. Here an
 * entry stays until the user removes it, and a file that cannot be read is an
 * error rather than an empty list — treating it as empty would lose grants, and
 * guessing at its contents could broaden them.
 *
 * It lives outside every repository (the desktop keeps it in its user-data
 * folder), because which folders on this machine an AI may reach is a fact about
 * this machine, not about any one project.
 */

export const ACCESS_REGISTRY_SCHEMA_VERSION = 1

const entrySchema = z.object({
  /** Opaque and stable for as long as the grant exists. Never derived from the path. */
  checkout_id: z.string().min(1),
  /** Canonical, symlink-resolved absolute path at the time it was enabled. */
  path: z.string().min(1),
  /** The project UUID found there when enabled; a different one later is a mismatch. */
  project_id: z.uuid(),
  /** The project's name when enabled, used only to describe an entry that cannot be opened. */
  name: z.string(),
  enabled_at: z.string(),
})

const registrySchema = z.object({
  schema_version: z.literal(ACCESS_REGISTRY_SCHEMA_VERSION),
  checkouts: z.array(entrySchema),
})

export type AccessEntry = z.infer<typeof entrySchema>
export type AccessRegistry = z.infer<typeof registrySchema>

const EMPTY: AccessRegistry = { schema_version: ACCESS_REGISTRY_SCHEMA_VERSION, checkouts: [] }

/** Server liveness for the shared connection is recorded beside the registry, not in any project. */
export function registrySessionsDir(registryPath: string): string {
  return join(dirname(registryPath), 'mcp-runtime', 'sessions')
}

/**
 * Reads the registry fresh from disk. A missing file means nothing has been
 * enabled yet. Anything else that goes wrong is reported, never read as empty.
 */
export async function readAccessRegistry(registryPath: string): Promise<AccessRegistry> {
  let text: string
  try {
    text = await readFile(registryPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY
    throw unreadable(registryPath, error)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw unreadable(registryPath, error)
  }
  const result = registrySchema.safeParse(parsed)
  if (!result.success) throw unreadable(registryPath, result.error)

  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const entry of result.data.checkouts) {
    // A duplicate would make a checkout_id or a path ambiguous, so the file as a
    // whole is not trusted rather than one of the two being picked.
    if (ids.has(entry.checkout_id) || paths.has(pathKey(entry.path))) {
      throw unreadable(registryPath, new Error(`duplicate entry for ${entry.path}`))
    }
    ids.add(entry.checkout_id)
    paths.add(pathKey(entry.path))
  }
  return result.data
}

export interface GrantInput {
  /** Canonical checkout path; callers resolve it before granting. */
  readonly path: string
  readonly projectId: string
  readonly name: string
}

/**
 * Enables one checkout. Enabling one that is already enabled keeps its
 * checkout_id, so an AI carrying that id is not broken by the user re-ticking
 * a box; the recorded project and name are refreshed.
 */
export async function grantCheckoutAccess(
  registryPath: string,
  input: GrantInput,
): Promise<AccessEntry> {
  return await updateRegistry(registryPath, (registry) => {
    const existing = registry.checkouts.find((entry) => samePath(entry.path, input.path))
    const entry: AccessEntry = {
      checkout_id: existing?.checkout_id ?? randomUUID(),
      path: input.path,
      project_id: input.projectId,
      name: input.name,
      enabled_at: existing?.enabled_at ?? new Date().toISOString(),
    }
    const others = registry.checkouts.filter((candidate) => candidate !== existing)
    return { next: { ...registry, checkouts: [...others, entry] }, result: entry }
  })
}

/**
 * Disables one checkout by path. Takes effect on the next operation any server
 * resolves; the id is discarded, so enabling again issues a new one.
 */
export async function revokeCheckoutAccess(registryPath: string, path: string): Promise<boolean> {
  return await updateRegistry(registryPath, (registry) => {
    const kept = registry.checkouts.filter((entry) => !samePath(entry.path, path))
    return {
      next: { ...registry, checkouts: kept },
      result: kept.length !== registry.checkouts.length,
    }
  })
}

/**
 * Read, change, and replace under a lock shared by every writer. The read
 * happens inside the lock and throws on a corrupt file, so a damaged registry is
 * never overwritten with a guess.
 */
async function updateRegistry<T>(
  registryPath: string,
  change: (registry: AccessRegistry) => { next: AccessRegistry; result: T },
): Promise<T> {
  const release = await acquireFileLock(
    `${registryPath}.lock`,
    'Another Knightbook process is changing MCP project access. Try again.',
  )
  try {
    const { next, result } = change(await readAccessRegistry(registryPath))
    await mkdir(dirname(registryPath), { recursive: true })
    const temporary = `${registryPath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await rename(temporary, registryPath)
    } catch (error) {
      await rm(temporary, { force: true })
      throw new ProjectError(
        'registry_write_failed',
        `The MCP project access list could not be saved at ${registryPath}: ${describe(error)}. ` +
          'Nothing was changed.',
      )
    }
    return result
  } finally {
    await release()
  }
}

/** Windows and macOS compare paths case-insensitively by default; treating them so avoids two grants for one folder. */
function pathKey(path: string): string {
  return process.platform === 'linux' ? path : path.toLowerCase()
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}

function unreadable(registryPath: string, error: unknown): ProjectError {
  return new ProjectError(
    'registry_unreadable',
    `The MCP project access list at ${registryPath} could not be read (${describe(error)}). ` +
      'No project is reachable until it is repaired or removed; it was left untouched.',
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
