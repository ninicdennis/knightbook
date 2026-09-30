import { open } from 'node:fs/promises'
import { resolveContentPath } from './links.js'
import { RESERVED_DIR } from '../records/paths.js'
import type { Project } from '../records/project.js'

/**
 * An image a document or ticket names by a relative path, read for display.
 *
 * Opening a document must still not reach the network or read outside the
 * project, so this is the only way an image gets in, and it is narrow: the path
 * goes through the same boundary checks as a link (project-relative, real path
 * inside the root, symlinks resolved), the app's own records are refused, the
 * type is decided by the file's bytes rather than its name, and there is a size
 * cap. SVG is not among the types, because it can carry scripts. The result is
 * bytes and a media type; the file is only read, and reading it records nothing.
 */

/** Large enough for a screenshot or a logo; small enough to hand over as a data URL. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export type ProjectImage =
  | { readonly kind: 'image'; readonly mediaType: ImageMediaType; readonly bytes: Buffer }
  | {
      readonly kind: 'unavailable'
      readonly reason:
        'outside_project' | 'reserved' | 'not_found' | 'unsupported_type' | 'too_large'
      /** What happened, written for the person reading the document. */
      readonly message: string
    }

function unavailable(
  reason: Extract<ProjectImage, { kind: 'unavailable' }>['reason'],
  message: string,
): ProjectImage {
  return { kind: 'unavailable', reason, message }
}

/** The media type these first bytes belong to, or null for anything else (SVG included). */
export function sniffImageType(head: Uint8Array): ImageMediaType | null {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte)
  const ascii = (from: number, text: string) =>
    [...text].every((char, index) => head[from + index] === char.charCodeAt(0))

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  return null
}

/** `path` is project-relative with forward slashes, already decoded once. */
export async function readProjectImage(project: Project, path: string): Promise<ProjectImage> {
  const absolute = await resolveContentPath(project, path)
  if (absolute === null) {
    return unavailable(
      'outside_project',
      `${path} is not inside this project, so it was not shown.`,
    )
  }

  if (path === RESERVED_DIR || path.startsWith(`${RESERVED_DIR}/`)) {
    return unavailable('reserved', `${path} is one of the app's own records, not an image to show.`)
  }

  let file
  try {
    file = await open(absolute, 'r')
  } catch {
    return unavailable('not_found', `${path} does not exist in this project.`)
  }

  try {
    const info = await file.stat()
    if (!info.isFile()) return unavailable('not_found', `${path} is not a file.`)
    if (info.size > MAX_IMAGE_BYTES) {
      return unavailable(
        'too_large',
        `${path} is ${megabytes(info.size)}, over the ${megabytes(MAX_IMAGE_BYTES)} limit for images shown here.`,
      )
    }

    const bytes = await file.readFile()
    const mediaType = sniffImageType(bytes.subarray(0, 16))
    if (!mediaType) {
      return unavailable(
        'unsupported_type',
        `${path} is not a PNG, JPEG, GIF or WebP image, so it was not shown. SVG is never shown, because it can contain scripts.`,
      )
    }
    return { kind: 'image', mediaType, bytes }
  } finally {
    await file.close()
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
