import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Carries the app's own state across the rename from Projectspace to Knightbook.
 *
 * Electron derives `userData` from the application's name, so renaming moves
 * that directory. The colour-scheme setting and the recent-project list would be
 * left in a folder nothing reads any more, and nothing would look broken — the
 * app would come up as if it had never been run, which is worse than an error,
 * because there is nothing to tell the user where their list went.
 *
 * There is more than one place to look, which is the part worth knowing. Before
 * this rename the app never set its own name, so Electron fell back to the
 * `name` in package.json and the real directory was `%APPDATA%/@projectspace/desktop`
 * — the scope and all. An older build left one at `%APPDATA%/Projectspace`.
 * Candidates are therefore tried in order and the first that exists wins, rather
 * than guessing at one path.
 *
 * This copies rather than moves. The old file is left exactly where it is, so
 * an older build installed alongside this one still finds its own state, and a
 * failed copy costs nothing. It runs once: after the copy the new file exists,
 * and the next launch takes the `kept` path.
 *
 * Project records are not involved. Those live in each project's own
 * `.projectspace/` folder, which this rename deliberately does not touch.
 */

export type AdoptionResult =
  /** The current file already exists. Nothing was read from the old location. */
  | { outcome: 'kept' }
  /** State from the previous name was copied forward. */
  | { outcome: 'adopted'; from: string }
  /** Neither file exists: a first run, or a fresh machine. */
  | { outcome: 'none' }
  /**
   * The old state was found but could not be copied. The app continues with
   * defaults rather than refusing to start; the caller decides whether to say
   * so, because a lost preference is a convenience regression and not data loss.
   */
  | { outcome: 'failed'; from: string; reason: string }

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function adoptLegacyAppState(
  currentFile: string,
  /** Where the previous names kept it, best first. */
  legacyFiles: readonly string[],
): Promise<AdoptionResult> {
  if (await exists(currentFile)) return { outcome: 'kept' }

  let legacyFile: string | undefined
  for (const candidate of legacyFiles) {
    if (await exists(candidate)) {
      legacyFile = candidate
      break
    }
  }
  if (legacyFile === undefined) return { outcome: 'none' }

  try {
    await mkdir(dirname(currentFile), { recursive: true })
    await copyFile(legacyFile, currentFile)
    return { outcome: 'adopted', from: legacyFile }
  } catch (error) {
    return {
      outcome: 'failed',
      from: legacyFile,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
