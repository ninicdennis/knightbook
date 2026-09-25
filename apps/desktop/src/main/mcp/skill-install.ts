import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { InstalledSkillState, SkillTargetId } from '../../shared/skill-setup-contract.js'

/**
 * Copying the bundled workflow skill into a folder an AI client reads. Nothing
 * here imports Electron, so every conflict case can be tested on real folders.
 *
 * The rule the ticket sets is that a copy the user may have customised is never
 * overwritten. The only copy Knightbook replaces is one whose contents are still
 * exactly what Knightbook itself wrote there, which is what `recorded` proves.
 */

export interface SkillTarget {
  readonly id: SkillTargetId
  readonly client: 'Claude Code' | 'Codex'
  readonly scope: 'personal' | 'project'
  readonly dir: string
}

/**
 * The folders each client documents reading skills from, checked 2026-09-24:
 * Claude Code reads `~/.claude/skills/<name>` and `.claude/skills/<name>`;
 * Codex reads `~/.agents/skills` and `.agents/skills` up to the repository root.
 * The folder is named after the skill, which is how both clients name it.
 */
export function skillTargets(home: string, checkout: string): SkillTarget[] {
  const folder = (base: string, client: string) => join(base, client, 'skills', 'projectspace')
  return [
    {
      id: 'claude-personal',
      client: 'Claude Code',
      scope: 'personal',
      dir: folder(home, '.claude'),
    },
    {
      id: 'claude-project',
      client: 'Claude Code',
      scope: 'project',
      dir: folder(checkout, '.claude'),
    },
    { id: 'codex-personal', client: 'Codex', scope: 'personal', dir: folder(home, '.agents') },
    { id: 'codex-project', client: 'Codex', scope: 'project', dir: folder(checkout, '.agents') },
  ]
}

/** Relative path, always with `/`, to file contents. */
export type SkillFiles = ReadonlyMap<string, Buffer>

export async function readSkillFolder(dir: string): Promise<SkillFiles | null> {
  try {
    if (!(await stat(dir)).isDirectory()) return null
  } catch {
    return null
  }
  const files = new Map<string, Buffer>()
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const absolute = join(entry.parentPath, entry.name)
    files.set(relative(dir, absolute).split(sep).join('/'), await readFile(absolute))
  }
  return files
}

/** One hash over every file's path and bytes, in a stable order. */
export function fingerprintOf(files: SkillFiles): string {
  const hash = createHash('sha256')
  for (const path of [...files.keys()].sort()) {
    hash.update(path).update('\0').update(files.get(path)!).update('\0')
  }
  return hash.digest('hex')
}

/**
 * What is at a target folder, compared with what this app ships.
 *
 * `outdated` needs evidence: the folder still matches the fingerprint recorded
 * when Knightbook installed there. Without that record a different copy could
 * be an older version or the user's own edits, and the two cannot be told
 * apart, so it is reported as `modified` and left alone.
 */
export async function inspectInstalledSkill(
  dir: string,
  bundled: SkillFiles,
  recorded: string | null,
): Promise<InstalledSkillState> {
  let isDirectory: boolean
  try {
    isDirectory = (await stat(dir)).isDirectory()
  } catch {
    return 'absent'
  }
  if (!isDirectory) return 'modified'

  const installed = await readSkillFolder(dir)
  if (installed === null) return 'modified'
  const fingerprint = fingerprintOf(installed)
  if (fingerprint === fingerprintOf(bundled)) return 'matching'
  return fingerprint === recorded ? 'outdated' : 'modified'
}

export class SkillConflictError extends Error {}

async function writeSkillFolder(dir: string, files: SkillFiles): Promise<void> {
  for (const [path, content] of files) {
    const target = join(dir, ...path.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }
}

/**
 * Installs into an absent folder, or updates one proven `outdated`. The state is
 * checked again here rather than trusted from the screen, because the user can
 * edit the folder between looking at the dialog and pressing the button.
 * Returns the fingerprint to record for this folder.
 */
export async function installSkill(
  dir: string,
  bundled: SkillFiles,
  options: { expected: 'absent' | 'outdated'; recorded: string | null },
): Promise<string> {
  const state = await inspectInstalledSkill(dir, bundled, options.recorded)
  if (state !== options.expected) {
    throw new SkillConflictError(
      `The folder changed since it was checked: it is now ${state}. Nothing was written.`,
    )
  }

  // Built beside the target and moved into place, so a failure part-way never
  // leaves a half-written skill where a client would load it.
  const staging = `${dir}.knightbook-${randomUUID().slice(0, 8)}`
  const retired = `${staging}-old`
  try {
    await writeSkillFolder(staging, bundled)
    if (state === 'outdated') await rename(dir, retired)
    await rename(staging, dir)
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(retired, { recursive: true, force: true })
  }
  return fingerprintOf(bundled)
}

/** Writes a fresh `projectspace` folder under `parent`, never into an existing one. */
export async function exportSkill(parent: string, bundled: SkillFiles): Promise<string> {
  const dir = join(parent, 'projectspace')
  try {
    await stat(dir)
    throw new SkillConflictError(
      `${dir} already exists. Choose another folder, or move that one first.`,
    )
  } catch (error) {
    if (error instanceof SkillConflictError) throw error
  }
  await writeSkillFolder(dir, bundled)
  return dir
}
