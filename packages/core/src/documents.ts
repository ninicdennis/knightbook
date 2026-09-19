import { readdir, stat } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { ProjectError } from './errors.js'
import { parseRecord, serializeRecord } from './frontmatter.js'
import { assertRealPathInRoot, RESERVED_DIR, reservedPaths, resolveInRoot, toProjectRelative } from './paths.js'
import type { Project } from './project.js'
import type { Revision } from './revision.js'
import { readRecord, writeRecord } from './write.js'

/**
 * Decision D-011: existing Markdown stays where it already is. Including a
 * document records a project-relative path in the manifest; it never copies,
 * moves, or rewrites the file, and it does not add frontmatter to a document
 * just to register it.
 *
 * Technical design section 3: `documents_include` updates only the manifest, so
 * an interruption can leave a stale entry but can never make a source file
 * disappear. Paths are stored relative and with forward slashes so a checkout on
 * another platform resolves them unchanged.
 */

export interface IncludedDocument {
  /** Project-relative path with forward slashes, as stored in the manifest. */
  readonly path: string
  /** The manifest entry this came from: a file, or a folder that contains it. */
  readonly includedVia: string
  readonly title: string
}

export interface DocumentProblem {
  readonly path: string
  readonly reason: 'missing' | 'not_readable'
}

export interface DocumentListing {
  readonly documents: IncludedDocument[]
  /** Entries that no longer resolve. Reported, never silently dropped. */
  readonly problems: DocumentProblem[]
}

/** Normalizes a user- or AI-supplied path to the manifest's stored form. */
function toManifestPath(project: Project, candidate: string): string {
  const absolute = resolveInRoot(project.root, candidate)
  const relative = toProjectRelative(project.root, absolute)

  if (relative === '' || relative === '.') {
    throw new ProjectError('outside_project', 'The project root itself cannot be included.')
  }
  if (relative === RESERVED_DIR || relative.startsWith(`${RESERVED_DIR}/`)) {
    throw new ProjectError(
      'outside_project',
      `${RESERVED_DIR}/ holds the app's own records and is not included as documentation.`,
    )
  }
  return relative
}

/**
 * Adds paths to the manifest. Repeating an inclusion is a no-op rather than a
 * duplicate, so an interrupted call can simply be retried.
 */
export async function includeDocuments(project: Project, paths: string[]): Promise<Project> {
  const additions: string[] = []
  for (const candidate of paths) {
    const relative = toManifestPath(project, candidate)
    const absolute = resolveInRoot(project.root, relative)
    await assertRealPathInRoot(project.root, absolute)

    try {
      await stat(absolute)
    } catch {
      throw new ProjectError('not_found', `No such file or folder in this project: ${relative}`)
    }
    additions.push(relative)
  }

  const current = new Set(project.frontmatter.documents_include)
  const next = [...current]
  for (const addition of additions) {
    if (!current.has(addition)) next.push(addition)
  }
  if (next.length === current.size) return project

  return await saveInclusions(project, next)
}

/** Removes a manifest entry. The source file is deliberately left untouched. */
export async function removeFromWorkspace(project: Project, path: string): Promise<Project> {
  const relative = toManifestPath(project, path)
  const next = project.frontmatter.documents_include.filter((entry) => entry !== relative)
  if (next.length === project.frontmatter.documents_include.length) {
    throw new ProjectError('not_found', `${relative} is not included in this workspace.`)
  }
  return await saveInclusions(project, next)
}

async function saveInclusions(project: Project, entries: string[]): Promise<Project> {
  const path = reservedPaths.projectFile(project.root)
  const { content, revision } = await readRecord(project.root, path)
  const record = parseRecord(content)
  record.data.set('documents_include', entries)

  const written = await writeRecord(project.root, path, serializeRecord(record), {
    expectedRevision: revision,
  })
  return {
    ...project,
    frontmatter: { ...project.frontmatter, documents_include: entries },
    revision: written.revision,
  }
}

/**
 * Resolves manifest entries to the Markdown files they currently point at. A
 * folder entry expands to the Markdown inside it, so adding a file to that
 * folder later makes it appear without another inclusion step.
 */
export async function listIncludedDocuments(project: Project): Promise<DocumentListing> {
  const documents: IncludedDocument[] = []
  const problems: DocumentProblem[] = []
  const seen = new Set<string>()

  for (const entry of project.frontmatter.documents_include) {
    let absolute: string
    try {
      absolute = resolveInRoot(project.root, entry)
      await assertRealPathInRoot(project.root, absolute)
    } catch {
      problems.push({ path: entry, reason: 'not_readable' })
      continue
    }

    let info
    try {
      info = await stat(absolute)
    } catch {
      problems.push({ path: entry, reason: 'missing' })
      continue
    }

    const found = info.isDirectory()
      ? await markdownUnder(project, absolute)
      : [toProjectRelative(project.root, absolute)]

    for (const path of found) {
      if (seen.has(path)) continue
      seen.add(path)
      documents.push({ path, includedVia: entry, title: titleFromPath(path) })
    }
  }

  documents.sort((a, b) => (a.path < b.path ? -1 : 1))
  return { documents, problems }
}

async function markdownUnder(project: Project, directory: string): Promise<string[]> {
  const found: string[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === RESERVED_DIR || entry.name === '.git' || entry.name === 'node_modules') {
        continue
      }
      const child = join(current, entry.name)
      if (entry.isDirectory()) await walk(child)
      else if (entry.name.toLowerCase().endsWith('.md')) {
        found.push(toProjectRelative(project.root, child))
      }
    }
  }

  await walk(directory)
  return found
}

function titleFromPath(path: string): string {
  return posix.basename(path).replace(/\.md$/i, '')
}

export interface DocumentContent {
  readonly path: string
  readonly content: string
  readonly revision: Revision
}

export async function readDocument(project: Project, path: string): Promise<DocumentContent> {
  const relative = toManifestPath(project, path)
  const absolute = resolveInRoot(project.root, relative)
  const { content, revision } = await readRecord(project.root, absolute)
  return { path: relative, content, revision }
}

/**
 * Writes a document in place. This is whole-file content by design: these are
 * the user's own documents, not app-managed records, so nothing here rewrites
 * their frontmatter or imposes a structure on them.
 */
export async function writeDocument(
  project: Project,
  path: string,
  content: string,
  expectedRevision: Revision,
): Promise<DocumentContent> {
  const relative = toManifestPath(project, path)
  const absolute = resolveInRoot(project.root, relative)
  const { revision } = await writeRecord(project.root, absolute, content, { expectedRevision })
  return { path: relative, content, revision }
}
