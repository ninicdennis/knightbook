import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'
import type { AstroIntegration } from 'astro'

/**
 * Stops the build when a page has no title or description, or shares either with
 * another page (ticket 0f142dd8), so every page can be found and shared on its
 * own. Redirect pages, which Astro writes for the addresses in redirects.ts, are
 * not pages of their own and are skipped.
 */
export interface PageMetadata {
  path: string
  title: string
  description: string
}

export function metadataProblems(pages: PageMetadata[]): string[] {
  const problems: string[] = []
  for (const field of ['title', 'description'] as const) {
    const seen = new Map<string, string>()
    for (const page of pages) {
      const value = page[field].trim()
      if (!value) {
        problems.push(`${page.path} has no ${field}`)
        continue
      }
      const other = seen.get(value)
      if (other) problems.push(`${page.path} has the same ${field} as ${other}: "${value}"`)
      else seen.set(value, page.path)
    }
  }
  return problems
}

const unescape = (text: string) =>
  text
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

export function readMetadata(path: string, html: string): PageMetadata | null {
  if (/<meta http-equiv="refresh"/.test(html)) return null
  return {
    path,
    title: unescape(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
    description: unescape(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''),
  }
}

export function metadataCheck(): AstroIntegration {
  return {
    name: 'knightbook-metadata-check',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir)
        const entries = await readdir(root, { withFileTypes: true, recursive: true })
        const pages: PageMetadata[] = []
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.html')) continue
          const file = join(entry.parentPath, entry.name)
          const path = relative(root, file).split(sep).join('/')
          const page = readMetadata(path, await readFile(file, 'utf8'))
          if (page) pages.push(page)
        }
        const problems = metadataProblems(pages)
        if (problems.length > 0) {
          throw new Error(
            `Page titles and descriptions must be unique:\n  ${problems.join('\n  ')}`,
          )
        }
      },
    },
  }
}
