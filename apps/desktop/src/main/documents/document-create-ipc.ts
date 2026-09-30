import { ipcMain } from 'electron'
import { createDocument, isProjectError, openProject, ProjectError } from '@knightbook/core'
import { guard } from '../guard.js'
import { buildListing } from './documents-ipc.js'
import type { CreatedDocumentView } from '../../shared/documents-contract.js'

/**
 * Creating a document from the app. It is core's `createDocument`, the same one
 * MCP's `document_create` uses, so both refuse the same things: a path outside
 * the project or inside its records, a file that is not Markdown, and above all
 * an existing file, which is never overwritten.
 */
export function registerDocumentCreateHandler(): void {
  ipcMain.handle(
    'document:create',
    async (_event, rootPath: unknown, path: unknown, content: unknown) =>
      await guard<CreatedDocumentView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof path !== 'string' ||
          typeof content !== 'string'
        ) {
          throw new Error('A project, a path and the content are required.')
        }
        return await createInProject(rootPath, path, content)
      }),
  )
}

export async function createInProject(
  rootPath: string,
  path: string,
  content: string,
): Promise<CreatedDocumentView> {
  try {
    const { project, document } = await createDocument(await openProject(rootPath), path, content)
    return { path: document.path, documents: await buildListing(project) }
  } catch (error) {
    // Core names the absolute path; the person chose a project-relative one.
    if (isProjectError(error) && error.code === 'already_exists') {
      throw new ProjectError(
        'already_exists',
        `${path} already exists, so nothing was written. Choose another name.`,
      )
    }
    throw error
  }
}
