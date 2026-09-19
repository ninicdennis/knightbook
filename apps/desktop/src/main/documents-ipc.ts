import { ipcMain, shell } from 'electron'
import {
  documentRecordId,
  listIncludedDocuments,
  openProject,
  readDocument,
  recordReview,
  resolveInRoot,
  reviewStatus,
} from '@projectspace/core'
import type { DocumentListView, DocumentReadView, Result } from '../shared/contract.js'
import { guard } from './guard.js'

/**
 * Reading documentation in the app, per the specification's first requirement.
 * Editing stays in the user's own editor for now: the formatted editor is
 * blocked on the Milkdown inline-HTML finding, and section 10 accepts an
 * external-editor fallback in the meantime.
 *
 * The renderer never receives an absolute path. It asks for a project-relative
 * one and the host resolves it through the validated project boundary, so a
 * crafted link in a document cannot reach outside the checkout.
 */

export function registerDocumentHandlers(): void {
  ipcMain.handle('documents:list', async (_event, rootPath: unknown) =>
    await guard<DocumentListView>(async () => {
      if (typeof rootPath !== 'string') throw new Error('A project path is required.')

      const project = await openProject(rootPath)
      const listing = await listIncludedDocuments(project)

      const documents = []
      for (const document of listing.documents) {
        documents.push({
          path: document.path,
          title: document.title,
          includedVia: document.includedVia,
          review: await documentReview(project, document.path),
        })
      }
      return { documents, problems: listing.problems }
    }),
  )

  ipcMain.handle('document:read', async (_event, rootPath: unknown, path: unknown) =>
    await guard<DocumentReadView>(async () => {
      if (typeof rootPath !== 'string' || typeof path !== 'string') {
        throw new Error('A project and document path are required.')
      }

      const project = await openProject(rootPath)
      const document = await readDocument(project, path)
      return {
        path: document.path,
        content: document.content,
        revision: document.revision,
        review: await documentReview(project, document.path),
      }
    }),
  )

  /** Decision D-003: only the user records a review, never an AI tool. */
  ipcMain.handle(
    'document:review',
    async (_event, rootPath: unknown, path: unknown) =>
      await guard<DocumentReadView>(async () => {
        if (typeof rootPath !== 'string' || typeof path !== 'string') {
          throw new Error('A project and document path are required.')
        }

        const project = await openProject(rootPath)
        const document = await readDocument(project, path)
        await recordReview(project, documentRecordId(project, path), document.content, {
          note: 'Reviewed in the app.',
        })

        return {
          path: document.path,
          content: document.content,
          revision: document.revision,
          review: await documentReview(project, document.path),
        }
      }),
  )

  /**
   * Hands a document to the user's own editor. The path is resolved through the
   * project boundary first, so this cannot be pointed at an arbitrary file, and
   * `openPath` opens with the registered handler rather than executing anything.
   */
  ipcMain.handle(
    'document:openExternally',
    async (_event, rootPath: unknown, path: unknown) =>
      await guard<null>(async () => {
        if (typeof rootPath !== 'string' || typeof path !== 'string') {
          throw new Error('A project and document path are required.')
        }

        const project = await openProject(rootPath)
        await readDocument(project, path) // Proves it exists and is in the project.
        const failure = await shell.openPath(resolveInRoot(project.root, path))
        if (failure) throw new Error(failure)
        return null
      }),
  )

  /**
   * Opens an http(s) link found in a document, on an explicit user click. The
   * scheme is checked here rather than trusted from the renderer, so a document
   * cannot smuggle a `file:` or custom-protocol URL through this channel.
   */
  ipcMain.handle('link:openExternal', async (_event, url: unknown) =>
    await guard<null>(async () => {
      if (typeof url !== 'string') throw new Error('A URL is required.')

      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new Error('That link is not a valid URL.')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Refused to open a ${parsed.protocol} link from a document.`)
      }

      await shell.openExternal(parsed.toString())
      return null
    }),
  )
}

async function documentReview(
  project: Parameters<typeof readDocument>[0],
  path: string,
): Promise<DocumentReadView['review']> {
  const document = await readDocument(project, path)
  const status = await reviewStatus(project, documentRecordId(project, path), document.content)
  return {
    state: status.state,
    lastReviewedAt: status.lastReview?.reviewedAt ?? null,
    changeSummary: status.changeSummary,
  }
}

export type { Result }
