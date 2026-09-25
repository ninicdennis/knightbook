import { stat } from 'node:fs/promises'
import { isMap } from 'yaml'
import { toManifestPath } from './documents.js'
import { ProjectError } from './errors.js'
import { parseRecord, serializeRecord } from './frontmatter.js'
import { assertRealPathInRoot, reservedPaths, resolveInRoot } from './paths.js'
import type { Project } from './project.js'
import { readRecord, writeRecord } from './write.js'

/**
 * Optional names for document folders, such as "Documentation" for `docs`.
 * They live in the project manifest as a sparse map keyed by project-relative
 * folder path, so the app and an AI tool see the same organization. A title is
 * only a label: it never renames, moves or rewrites a folder or its files.
 *
 * A folder renamed or deleted outside the app leaves its title behind. That is
 * reported as `missing`, never cleaned up automatically, because the user may be
 * about to rename it back and the title is theirs.
 */

export const FOLDER_TITLE_MAX_LENGTH = 80

export interface FolderTitle {
  /** Project-relative folder path with forward slashes. */
  readonly path: string
  readonly title: string
  /** True when no folder exists at this path any more. */
  readonly missing: boolean
}

export async function listFolderTitles(project: Project): Promise<FolderTitle[]> {
  const titles: FolderTitle[] = []
  for (const [path, title] of Object.entries(project.frontmatter.folder_titles ?? {})) {
    titles.push({ path, title, missing: !(await isFolderInProject(project, path)) })
  }
  return titles.sort((a, b) => (a.path < b.path ? -1 : 1))
}

/**
 * Sets a folder's title, or clears it with null. Clearing works for a folder
 * that no longer exists, which is how a stale title is removed deliberately.
 */
export async function setFolderTitle(
  project: Project,
  folder: string,
  title: string | null,
): Promise<Project> {
  const path = toManifestPath(project, folder.replace(/[\\/]+$/, ''))
  const trimmed = title?.trim() ?? null

  if (trimmed !== null) {
    if (trimmed === '') throw new ProjectError('invalid_path', 'A folder title cannot be empty.')
    if (trimmed.length > FOLDER_TITLE_MAX_LENGTH) {
      throw new ProjectError(
        'invalid_path',
        `A folder title can be at most ${FOLDER_TITLE_MAX_LENGTH} characters.`,
      )
    }
    if (!(await isFolderInProject(project, path))) {
      throw new ProjectError('not_found', `No such folder in this project: ${path}`)
    }
  }

  const file = reservedPaths.projectFile(project.root)
  const { content, revision } = await readRecord(project.root, file)
  const record = parseRecord(content)
  const existing = record.data.get('folder_titles')
  if (existing !== undefined && existing !== null && !isMap(existing)) {
    throw new ProjectError(
      'invalid_record',
      'folder_titles in project.md is not a map of folder paths to titles. Fix it by hand; ' +
        'it was left unchanged.',
    )
  }

  // From the file as just read, not the caller's copy, which may be older.
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(isMap(existing) ? existing.toJSON() : {})) {
    if (typeof value === 'string') next[key] = value
  }
  if (trimmed === null) delete next[path]
  else next[path] = trimmed

  // Edited key by key through the YAML document, so other entries keep their form.
  if (Object.keys(next).length === 0) record.data.delete('folder_titles')
  else if (!isMap(existing)) record.data.set('folder_titles', next)
  else if (trimmed === null) record.data.deleteIn(['folder_titles', path])
  else record.data.setIn(['folder_titles', path], trimmed)

  const written = await writeRecord(project.root, file, serializeRecord(record), {
    expectedRevision: revision,
  })
  const frontmatter: Project['frontmatter'] = { ...project.frontmatter, folder_titles: next }
  if (Object.keys(next).length === 0) delete frontmatter.folder_titles
  return { ...project, frontmatter, revision: written.revision }
}

async function isFolderInProject(project: Project, path: string): Promise<boolean> {
  try {
    const absolute = resolveInRoot(project.root, path)
    await assertRealPathInRoot(project.root, absolute)
    return (await stat(absolute)).isDirectory()
  } catch {
    return false
  }
}
