import { ipcMain } from 'electron'
import { openProject, readProjectImage } from '@knightbook/core'
import { guard } from '../guard.js'
import type { ProjectImageView } from '../../shared/documents-contract.js'

/**
 * An image a document names, for display. Core decides whether it may be read
 * at all (inside the project, a raster type by its bytes, under the size cap);
 * this hands the window a data URL, never a path or `file:` URL, so the window
 * still has no way to reach the filesystem itself.
 */
export function registerImageHandler(): void {
  ipcMain.handle(
    'image:read',
    async (_event, rootPath: unknown, path: unknown) =>
      await guard<ProjectImageView>(async () => {
        if (typeof rootPath !== 'string' || typeof path !== 'string') {
          throw new Error('A project and an image path are required.')
        }
        return await readImageView(rootPath, path)
      }),
  )
}

export async function readImageView(rootPath: string, path: string): Promise<ProjectImageView> {
  const image = await readProjectImage(await openProject(rootPath), path)
  return image.kind === 'image'
    ? {
        kind: 'image',
        dataUrl: `data:${image.mediaType};base64,${image.bytes.toString('base64')}`,
      }
    : { kind: 'unavailable', reason: image.reason, message: image.message }
}
