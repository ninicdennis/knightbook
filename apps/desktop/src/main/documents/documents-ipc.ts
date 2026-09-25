import { dialog, ipcMain, shell } from 'electron'
import {
  documentRecordId,
  includeDocuments,
  listFolderTitles,
  listIncludedDocuments,
  openProject,
  readDocument,
  recordReview,
  removeFromWorkspace,
  resolveInRoot,
  setFolderTitle,
  resolveLinkDestination,
  reviewStatus,
  type Project,
} from '@knightbook/core'
import type {
  DocumentListView,
  DocumentReadView,
  LinkDestinationView,
  Result,
} from '../../shared/contract.js'
import { guard } from '../guard.js'

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

async function buildListing(project: Project): Promise<DocumentListView> {
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
  return { documents, problems: listing.problems, folderTitles: await listFolderTitles(project) }
}

/**
 * Decision D-011: including is a manifest edit, never a copy or a move. The
 * picker opens at the project root and `includeDocuments` refuses anything that
 * resolves outside it, so a path chosen elsewhere is reported rather than stored.
 */
async function pickAndInclude(
  rootPath: string,
  properties: ('openFile' | 'openDirectory' | 'multiSelections')[],
  filters?: Electron.FileFilter[],
): Promise<DocumentListView> {
  const project = await openProject(rootPath)

  const chosen = await dialog.showOpenDialog({
    title: 'Include in this project',
    defaultPath: project.root.path,
    properties,
    ...(filters ? { filters } : {}),
  })
  // Cancelling is not a failure, and nothing changed, so the caller gets the
  // list exactly as it was.
  if (chosen.canceled || chosen.filePaths.length === 0) return await buildListing(project)

  return await buildListing(await includeDocuments(project, chosen.filePaths))
}

export function registerDocumentHandlers(): void {
  ipcMain.handle(
    'documents:list',
    async (_event, rootPath: unknown) =>
      await guard<DocumentListView>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        return await buildListing(await openProject(rootPath))
      }),
  )

  ipcMain.handle(
    'documents:includeFiles',
    async (_event, rootPath: unknown) =>
      await guard<DocumentListView>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        return await pickAndInclude(
          rootPath,
          ['openFile', 'multiSelections'],
          [{ name: 'Markdown', extensions: ['md'] }],
        )
      }),
  )

  ipcMain.handle(
    'documents:includeFolder',
    async (_event, rootPath: unknown) =>
      await guard<DocumentListView>(async () => {
        if (typeof rootPath !== 'string') throw new Error('A project path is required.')
        return await pickAndInclude(rootPath, ['openDirectory'])
      }),
  )

  /**
   * Removing an entry edits the manifest only. The document stays exactly where
   * it is on disk, which is the whole point of including things in place.
   */
  ipcMain.handle(
    'documents:removeEntry',
    async (_event, rootPath: unknown, entry: unknown) =>
      await guard<DocumentListView>(async () => {
        if (typeof rootPath !== 'string' || typeof entry !== 'string') {
          throw new Error('A project and an included entry are required.')
        }

        const project = await openProject(rootPath)
        return await buildListing(await removeFromWorkspace(project, entry))
      }),
  )

  /** A folder's title is manifest metadata; the folder and its files are not touched. */
  ipcMain.handle(
    'documents:setFolderTitle',
    async (_event, rootPath: unknown, folder: unknown, title: unknown) =>
      await guard<DocumentListView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof folder !== 'string' ||
          !(title === null || typeof title === 'string')
        ) {
          throw new Error('A project, a folder, and a title or null are required.')
        }
        return await buildListing(await setFolderTitle(await openProject(rootPath), folder, title))
      }),
  )

  ipcMain.handle(
    'document:read',
    async (_event, rootPath: unknown, path: unknown) =>
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

  /**
   * Decision D-003: only the user records a review, never an AI tool. A revision,
   * when given, is the one the user was shown; newer content is refused.
   */
  ipcMain.handle(
    'document:review',
    async (_event, rootPath: unknown, path: unknown, revision: unknown) =>
      await guard<DocumentReadView>(async () => {
        if (typeof rootPath !== 'string' || typeof path !== 'string') {
          throw new Error('A project and document path are required.')
        }

        const project = await openProject(rootPath)
        const document = await readDocument(project, path)
        await recordReview(project, documentRecordId(project, path), document.content, {
          note: 'Reviewed in the app.',
          ...(typeof revision === 'string' ? { expectedRevision: revision } : {}),
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
   * Where an in-project link leads. The renderer resolved the relative path
   * against the file it appears in; this checks the result against the project
   * boundary, the manifest and the ticket folder before anything is shown.
   */
  ipcMain.handle(
    'link:resolve',
    async (_event, rootPath: unknown, path: unknown) =>
      await guard<LinkDestinationView>(async () => {
        if (typeof rootPath !== 'string' || typeof path !== 'string') {
          throw new Error('A project and link path are required.')
        }
        return await resolveLinkDestination(await openProject(rootPath), path)
      }),
  )

  /**
   * Opens an http(s) link found in a document, on an explicit user click. The
   * scheme is checked here rather than trusted from the renderer, so a document
   * cannot smuggle a `file:` or custom-protocol URL through this channel.
   */
  ipcMain.handle(
    'link:openExternal',
    async (_event, url: unknown) =>
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
