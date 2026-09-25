import { stat } from 'node:fs/promises'
import { listIncludedDocuments } from './documents.js'
import {
  assertRealPathInRoot,
  RESERVED_DIR,
  reservedPaths,
  resolveInRoot,
} from '../records/paths.js'
import type { Project } from '../records/project.js'

/**
 * Where an in-project Markdown link leads. The renderer resolves a link's
 * relative path against the file it appears in, but that is a claim made by
 * content; this is the host's own answer, from the files on disk.
 *
 * It only reads. Following a link never includes a document, never opens a file
 * outside the project, and never treats an app record as a document.
 */

export type LinkDestination =
  | { readonly kind: 'document'; readonly path: string }
  | { readonly kind: 'ticket'; readonly id: string }
  | {
      readonly kind: 'unavailable'
      readonly reason:
        'outside_project' | 'reserved' | 'not_markdown' | 'not_included' | 'not_found'
      /** What happened and what the user can do, written for a person. */
      readonly message: string
    }

const MARKDOWN = /\.(md|markdown)$/i
const TICKET_FILE = new RegExp(
  `^${RESERVED_DIR.replace('.', '\\.')}/tickets/([A-Za-z0-9][A-Za-z0-9._-]*)\\.md$`,
)

function unavailable(
  reason: Extract<LinkDestination, { kind: 'unavailable' }>['reason'],
  message: string,
): LinkDestination {
  return { kind: 'unavailable', reason, message }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** `path` is project-relative with forward slashes, already decoded once. */
export async function resolveLinkDestination(
  project: Project,
  path: string,
): Promise<LinkDestination> {
  // A Windows separator or drive letter is refused rather than reinterpreted:
  // links in Markdown use forward slashes, and a path that only works on one
  // platform is not a portable project link.
  let absolute: string
  try {
    if (path.includes('\\') || /^[A-Za-z]:/.test(path)) throw new Error('not portable')
    absolute = resolveInRoot(project.root, path)
    // Traversal and symlinks that lead out of the project are both refused here.
    await assertRealPathInRoot(project.root, absolute)
  } catch {
    return unavailable(
      'outside_project',
      `${path} is not inside this project, so it was not opened.`,
    )
  }

  const ticket = TICKET_FILE.exec(path)
  if (ticket) {
    const id = ticket[1]!
    return (await exists(reservedPaths.ticketFile(project.root, id)))
      ? { kind: 'ticket', id }
      : unavailable('not_found', `There is no ticket ${id} in this project.`)
  }

  if (path === RESERVED_DIR || path.startsWith(`${RESERVED_DIR}/`)) {
    return unavailable(
      'reserved',
      `${path} is one of the app's own records. Only tickets there can be opened from a link.`,
    )
  }

  if (!MARKDOWN.test(path)) {
    return unavailable(
      'not_markdown',
      `${path} is not a Markdown document, so it does not open here.`,
    )
  }

  const listing = await listIncludedDocuments(project)
  if (listing.documents.some((document) => document.path === path)) {
    return { kind: 'document', path }
  }

  return (await exists(absolute))
    ? unavailable(
        'not_included',
        `${path} is not one of this project's documents. Include it under Documents to read it here.`,
      )
    : unavailable('not_found', `${path} does not exist in this project.`)
}
