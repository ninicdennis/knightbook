import { ipcMain } from 'electron'
import { openProject, searchDocuments } from '@knightbook/core'
import { guard } from './guard.js'
import type { DocumentSearchView } from '../shared/document-search-contract.js'

/**
 * Document search runs in the host for the same reason ticket search does: the
 * content is on disk, not in the window. It is core's `searchDocuments`, which
 * reads documents through the same scan as MCP's `project_search`.
 */
export function registerDocumentSearchHandler(): void {
  ipcMain.handle(
    'document:search',
    async (_event, rootPath: unknown, query: unknown) =>
      await guard<DocumentSearchView>(async () => {
        if (typeof rootPath !== 'string' || typeof query !== 'string') {
          throw new Error('A project and a query are required.')
        }

        const project = await openProject(rootPath)
        const result = await searchDocuments(project, query)
        return {
          checkoutPath: project.root.path,
          query,
          hits: result.hits.map((hit) => ({
            path: hit.path,
            title: hit.title,
            titleHighlights: [...hit.titleHighlights],
            excerpt: hit.excerpt,
            excerptHighlights: [...hit.excerptHighlights],
          })),
          totalMatches: result.totalMatches,
          unsearchable: [...result.unreadable],
        }
      }),
  )
}
