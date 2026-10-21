import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * An AppImage mounts itself at a new `/tmp/.mount_…` folder on every launch, so a
 * command pointing into its resources stops working as soon as the app closes.
 * The user copies the MCP command into their AI client once, so it has to name a
 * path that outlives the mount: this module keeps a copy of the runtime under the
 * app's user data and refreshes it whenever the AppImage's own copy differs
 * (technical design section 2, D-028).
 *
 * Everywhere else the installed resources folder is already permanent, and none
 * of this runs.
 */

export const PERSISTENT_RUNTIME_FOLDER = 'mcp-server'

/** The AppImage runtime sets APPIMAGE to the image's own path; nothing else does. */
export function isAppImage(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.APPIMAGE === 'string' && env.APPIMAGE !== ''
}

export function persistentRuntimeDir(userDataDir: string): string {
  return join(userDataDir, PERSISTENT_RUNTIME_FOLDER)
}

export interface RuntimeFile {
  readonly name: string
  readonly executable: boolean
}

export interface RuntimeCopyResult {
  readonly copied: string[]
  readonly unchanged: string[]
}

/**
 * Brings `targetDir` in line with `sourceDir` for the named files. A file whose
 * bytes already match is left alone, so a client running the copy is not
 * disturbed by every launch. A changed file is written beside the target and
 * renamed over it, so a client starting mid-copy finds either the old file or the
 * new one, never half of one. Throws on the first file that cannot be copied.
 */
export async function syncRuntimeCopy(
  sourceDir: string,
  targetDir: string,
  files: readonly RuntimeFile[],
): Promise<RuntimeCopyResult> {
  await mkdir(targetDir, { recursive: true })
  const result: RuntimeCopyResult = { copied: [], unchanged: [] }

  for (const file of files) {
    const source = await readFile(join(sourceDir, file.name))
    const target = join(targetDir, file.name)
    const mode = file.executable ? 0o755 : 0o644
    const existing = await readFile(target).catch(() => null)

    if (existing !== null && existing.equals(source)) {
      // Same bytes, but the executable bit may have been lost since; restoring
      // it is cheap and never touches the content.
      await chmod(target, mode)
      result.unchanged.push(file.name)
      continue
    }

    const staging = `${target}.${randomUUID()}.tmp`
    try {
      await writeFile(staging, source, { mode })
      await chmod(staging, mode)
      await rename(staging, target)
    } catch (error) {
      await rm(staging, { force: true })
      throw error
    }
    result.copied.push(file.name)
  }

  return result
}

let preparation: Promise<string | null> = Promise.resolve(null)

/**
 * Starts the copy once at launch. The promise resolves to null when the copy is
 * in place, or to a sentence saying why it is not, which the MCP panel shows so
 * a failed copy never reads as a working setup. The configuration stays on offer:
 * its path does not change, and the next successful launch fills it.
 */
export function prepareAppImageRuntime(
  sourceDir: string,
  userDataDir: string,
  nodeBinary: string,
): Promise<string | null> {
  const files: RuntimeFile[] = [
    { name: nodeBinary, executable: true },
    { name: 'server.mjs', executable: false },
  ]
  const targetDir = persistentRuntimeDir(userDataDir)
  preparation = syncRuntimeCopy(sourceDir, targetDir, files).then(
    () => null,
    (error: unknown) =>
      `The MCP server could not be copied to ${targetDir}, where the AppImage keeps it ` +
      `between launches: ${error instanceof Error ? error.message : String(error)}`,
  )
  return preparation
}

/** Null when there is nothing to report: not an AppImage, or the copy succeeded. */
export function appImageRuntimeProblem(): Promise<string | null> {
  return preparation
}
