import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Rendering project documents for reading. Technical design section 1 treats
 * document content as untrusted: scripts are stripped, document-driven
 * navigation is denied, and only links the host can validate remain clickable.
 *
 * Links are rewritten rather than left alone. An internal relative link becomes
 * a `data-document` reference the app resolves through the project boundary, and
 * an external http(s) link becomes a `data-external` reference the host opens on
 * an explicit click. Everything else — `file:`, `javascript:`, `data:`, custom
 * protocols — is rendered as inert text with a visible note, so nothing is
 * silently dropped and nothing unsafe is silently clickable.
 */

export type LinkTarget =
  | { kind: 'document'; path: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked'; raw: string }

/** Frontmatter is metadata, not prose; it is shown separately, not rendered. */
const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)?---[^\S\r\n]*(\r?\n)?/

export function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const match = FRONTMATTER.exec(source)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[1] ?? '', body: source.slice(match[0].length) }
}

export function classifyLink(href: string, fromPath: string): LinkTarget {
  const trimmed = href.trim()
  if (trimmed.length === 0) return { kind: 'blocked', raw: href }

  if (/^https?:\/\//i.test(trimmed)) return { kind: 'external', url: trimmed }

  // Any other scheme, protocol-relative URL, or absolute path is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('/')) {
    return { kind: 'blocked', raw: trimmed }
  }

  const withoutAnchor = trimmed.split('#')[0] ?? ''
  if (withoutAnchor.length === 0) return { kind: 'blocked', raw: trimmed }

  // Resolve relative to the linking document, then reject anything that climbs
  // out of the project. The host validates this again before reading.
  const base = fromPath.split('/').slice(0, -1)
  const segments = [...base, ...withoutAnchor.split('/')]
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (resolved.length === 0) return { kind: 'blocked', raw: trimmed }
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }

  return resolved.length === 0
    ? { kind: 'blocked', raw: trimmed }
    : { kind: 'document', path: resolved.join('/') }
}

export interface RenderedDocument {
  html: string
  frontmatter: string
}

export function renderMarkdown(source: string, fromPath: string): RenderedDocument {
  const { frontmatter, body } = splitFrontmatter(source)

  const renderer = new marked.Renderer()
  renderer.link = ({ href, title, tokens }) => {
    const text = renderer.parser.parseInline(tokens)
    const target = classifyLink(href ?? '', fromPath)
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : ''

    switch (target.kind) {
      case 'document':
        return `<a href="#" data-document="${escapeAttribute(target.path)}"${titleAttribute}>${text}</a>`
      case 'external':
        return `<a href="#" data-external="${escapeAttribute(target.url)}"${titleAttribute}>${text}</a>`
      case 'blocked':
        return `<span class="blocked-link" title="This link was not opened: ${escapeAttribute(
          target.raw,
        )}">${text}</span>`
    }
  }

  // Images could reach the network or the filesystem, so they are shown as a
  // note rather than loaded. Reading a document must not fetch anything.
  renderer.image = ({ href, text }) =>
    `<span class="blocked-image">[image: ${escapeAttribute(text || href || 'untitled')}]</span>`

  const html = marked.parse(body, { renderer, async: false, gfm: true })

  return {
    frontmatter,
    html: DOMPurify.sanitize(html, {
      ALLOWED_URI_REGEXP: /^#$/,
      ADD_ATTR: ['data-document', 'data-external'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base'],
      FORBID_ATTR: ['srcset', 'formaction', 'style'],
    }),
  }
}

function escapeAttribute(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
