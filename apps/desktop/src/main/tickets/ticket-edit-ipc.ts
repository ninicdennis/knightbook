import { ipcMain } from 'electron'
import { openProject, readTicket, updateTicket, type Project } from '@knightbook/core'
import { guard } from '../guard.js'
import { buildView } from '../project/project-view.js'
import type { ProjectView } from '../../shared/contract.js'
import type { TicketContentEdit, TicketLinksEdit } from '../../shared/ticket-edit-contract.js'

/** Both lists must be lists of text. Repeats are dropped, keeping the first place each had. */
export function parseLinksEdit(links: unknown): TicketLinksEdit {
  const { dependsOn, relatedDocuments } = (links ?? {}) as Record<string, unknown>
  const isTextList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (!isTextList(dependsOn) || !isTextList(relatedDocuments)) {
    throw new Error('Prerequisites and related documents must each be a list of text.')
  }
  return { dependsOn: [...new Set(dependsOn)], relatedDocuments: [...new Set(relatedDocuments)] }
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index])

/**
 * Nothing is written when both lists already match, so saving an unchanged
 * editor leaves the file alone. Otherwise core checks the revision and refuses a
 * prerequisite that is the ticket itself, unknown, or closes a cycle (D-032).
 */
export async function saveTicketLinks(
  project: Project,
  id: string,
  links: TicketLinksEdit,
  revision: string,
): Promise<void> {
  const { frontmatter } = await readTicket(project, id)
  if (
    sameList(frontmatter.depends_on, links.dependsOn) &&
    sameList(frontmatter.related_documents, links.relatedDocuments)
  ) {
    return
  }
  await updateTicket(project, id, {
    expectedRevision: revision,
    dependsOn: links.dependsOn,
    relatedDocuments: links.relatedDocuments,
  })
}

/** The window's own checks are not trusted: the host decides what a valid edit is. */
export function parseContentEdit(content: unknown): TicketContentEdit {
  if (typeof content !== 'object' || content === null) {
    throw new Error('A ticket edit needs a title and a body.')
  }
  const { title, body } = content as Record<string, unknown>
  if (typeof title !== 'string' || typeof body !== 'string') {
    throw new Error('A ticket edit needs a title and a body, both as text.')
  }
  const trimmed = title.trim()
  if (trimmed === '') throw new Error('A ticket needs a title.')
  if (/[\r\n]/.test(trimmed)) throw new Error('A ticket title is a single line.')
  return { title: trimmed, body }
}

const toLineFeeds = (text: string): string => text.replace(/\r\n/g, '\n')

/**
 * The fields an edit actually changes, or null when it changes nothing. A text
 * area always hands back `\n`, so line endings are compared loosely and a saved
 * body keeps the file's own: otherwise a checkout with CRLF endings would count
 * an untouched body as edited and rewrite every line of it.
 */
export function contentChanges(
  current: TicketContentEdit,
  edit: TicketContentEdit,
): Partial<TicketContentEdit> | null {
  const changes: Partial<TicketContentEdit> = {}
  if (edit.title !== current.title) changes.title = edit.title
  if (toLineFeeds(edit.body) !== toLineFeeds(current.body)) {
    const lineFeeds = toLineFeeds(edit.body)
    changes.body = current.body.includes('\r\n') ? lineFeeds.replace(/\n/g, '\r\n') : lineFeeds
  }
  return Object.keys(changes).length === 0 ? null : changes
}

/**
 * A blocker is either a reason or absent. Blank text means "clear it", because a
 * ticket holding an empty blocker would still read as blocked to anything that
 * only checks whether the field is there.
 */
export function parseBlocker(blocker: unknown): string | null {
  if (blocker === null) return null
  if (typeof blocker !== 'string') throw new Error('A blocker must be text, or null to clear it.')
  const trimmed = blocker.trim()
  return trimmed === '' ? null : trimmed
}

export function registerTicketEditHandlers(): void {
  ipcMain.handle(
    'ticket:setBlocker',
    async (_event, rootPath: unknown, id: unknown, blocker: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
          throw new Error('A project, ticket, and revision are required.')
        }

        const project = await openProject(rootPath)
        await updateTicket(project, id, {
          expectedRevision: revision,
          blocker: parseBlocker(blocker),
        })
        return await buildView(project)
      }),
  )

  ipcMain.handle(
    'ticket:editContent',
    async (_event, rootPath: unknown, id: unknown, content: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
          throw new Error('A project, ticket, and revision are required.')
        }
        const project = await openProject(rootPath)
        await saveTicketContent(project, id, parseContentEdit(content), revision)
        return await buildView(project)
      }),
  )

  ipcMain.handle(
    'ticket:setLinks',
    async (_event, rootPath: unknown, id: unknown, links: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
          throw new Error('A project, ticket, and revision are required.')
        }
        const project = await openProject(rootPath)
        await saveTicketLinks(project, id, parseLinksEdit(links), revision)
        return await buildView(project)
      }),
  )
}

/**
 * Writing nothing is safe against any revision, so an unchanged edit returns
 * without touching the file. A real change still names the revision it was made
 * on, and core refuses it as a conflict if the file has moved on since.
 */
export async function saveTicketContent(
  project: Project,
  id: string,
  edit: TicketContentEdit,
  revision: string,
): Promise<void> {
  const current = await readTicket(project, id)
  const changes = contentChanges({ title: current.frontmatter.title, body: current.body }, edit)
  if (changes !== null) await updateTicket(project, id, { expectedRevision: revision, ...changes })
}
