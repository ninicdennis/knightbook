import { realpath } from 'node:fs/promises'
import path, { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { PlatformPath } from 'node:path'
import { ProjectError } from './errors.js'

/**
 * Technical design section 3: resolve and validate real paths at runtime, and
 * reject traversal and symlinks that escape the selected root. A record's stored
 * path is untrusted input, so every resolution goes through here.
 */

/** The reserved folder holding app-owned records. Existing docs stay where they are. */
export const RESERVED_DIR = '.projectspace'

export interface ProjectRoot {
  /** The canonical, symlink-resolved absolute path of the checkout. */
  readonly path: string
}

/**
 * A root that does not exist yet is still a usable target for initialization, but
 * it must be resolved like any other. Its nearest existing ancestor may sit behind
 * a symlink (macOS keeps temporary folders under /var, a link to /private/var), and
 * leaving that part unresolved makes every later real-path check disagree with the
 * root and reject the project's own files as "outside" it.
 */
export async function resolveProjectRoot(candidate: string): Promise<ProjectRoot> {
  const absolute = resolve(candidate)
  const missing: string[] = []

  let current = absolute
  for (;;) {
    try {
      return { path: join(await realpath(current), ...missing.reverse()) }
    } catch {
      const parent = dirname(current)
      if (parent === current) return { path: absolute } // Nothing on the path resolves.
      missing.push(basename(current))
      current = parent
    }
  }
}

/**
 * Resolves a project-relative path and proves it stays inside the root. Returns
 * the absolute path; throws `outside_project` for traversal or an absolute path.
 */
export function resolveInRoot(root: ProjectRoot, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new ProjectError('outside_project', `Path must be project-relative: ${relativePath}`)
  }
  const absolute = resolve(root.path, relativePath)
  const back = relative(root.path, absolute)
  if (back.startsWith('..') || isAbsolute(back)) {
    throw new ProjectError('outside_project', `Path escapes the project: ${relativePath}`)
  }
  return absolute
}

function assertContained(root: ProjectRoot, candidate: string, original: string): void {
  const back = relative(root.path, candidate)
  if (back.startsWith('..') || isAbsolute(back)) {
    throw new ProjectError('outside_project', `Path resolves outside the project: ${original}`)
  }
}

/**
 * Confirms a path stays inside the root, both as written and after symlinks are
 * resolved. A target that does not exist yet still has to pass the textual check
 * and have its nearest existing ancestor resolve inside the root, so neither
 * `..` traversal nor a symlinked parent directory can place a new file outside.
 */
export async function assertRealPathInRoot(root: ProjectRoot, absolutePath: string): Promise<void> {
  const normalized = resolve(absolutePath)
  assertContained(root, normalized, absolutePath)

  try {
    assertContained(root, await realpath(normalized), absolutePath)
    return
  } catch (error) {
    if (error instanceof ProjectError) throw error
    // Does not exist yet: fall through and check the closest existing ancestor.
  }

  let ancestor = dirname(normalized)
  for (;;) {
    try {
      assertContained(root, await realpath(ancestor), absolutePath)
      return
    } catch (error) {
      if (error instanceof ProjectError) throw error
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) return // Reached the filesystem root without resolving.
    ancestor = parent
  }
}

export function toProjectRelative(root: ProjectRoot, absolutePath: string): string {
  return relative(root.path, absolutePath).split(sep).join('/')
}

/**
 * The project-relative form of an absolute path, such as one picked in a file
 * dialog, which names the folder the way the platform does (`C:\Users\...\docs`
 * on Windows). Separators become forward slashes for the manifest. A path outside
 * the root, including one on another drive, is refused rather than stored. `paths`
 * is the platform's path module, swappable so the Windows rules are tested anywhere.
 */
export function relativeToRoot(
  rootPath: string,
  absolutePath: string,
  paths: Pick<PlatformPath, 'isAbsolute' | 'relative' | 'sep'> = path,
): string {
  const back = paths.relative(rootPath, absolutePath)
  if (back === '..' || back.startsWith(`..${paths.sep}`) || paths.isAbsolute(back)) {
    throw new ProjectError('outside_project', `Path is outside the project: ${absolutePath}`)
  }
  return back.split(paths.sep).join('/')
}

/**
 * Like `relativeToRoot`, after resolving symlinks, because the root is stored as
 * its real path and a picked path may reach the same folder another way.
 */
export async function projectRelativeFromAbsolute(
  root: ProjectRoot,
  absolutePath: string,
): Promise<string> {
  let real: string
  try {
    real = await realpath(absolutePath)
  } catch {
    real = resolve(absolutePath) // Missing: the include step reports it by name.
  }
  return relativeToRoot(root.path, real)
}

export const reservedPaths = {
  dir: (root: ProjectRoot) => join(root.path, RESERVED_DIR),
  projectFile: (root: ProjectRoot) => join(root.path, RESERVED_DIR, 'project.md'),
  ticketsDir: (root: ProjectRoot) => join(root.path, RESERVED_DIR, 'tickets'),
  ticketFile: (root: ProjectRoot, id: string) =>
    join(root.path, RESERVED_DIR, 'tickets', `${id}.md`),
  plansDir: (root: ProjectRoot) => join(root.path, RESERVED_DIR, 'plans'),
  planFile: (root: ProjectRoot, id: string) => join(root.path, RESERVED_DIR, 'plans', `${id}.md`),
  routinesDir: (root: ProjectRoot) => join(root.path, RESERVED_DIR, 'routines'),
  routineFile: (root: ProjectRoot, id: string) =>
    join(root.path, RESERVED_DIR, 'routines', `${id}.md`),
}
