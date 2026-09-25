import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Rendering project documents for reading. Technical design section 1 treats
 * document content as untrusted: scripts are stripped, document-driven
 * navigation is denied, and only links the host can validate remain clickable.
 *
 * Links are rewritten rather than left alone. A relative link is resolved
 * against the file it appears in and becomes a `data-link` reference; the host
 * decides whether that path is an included document, a ticket, or neither. A
 * link to a heading in the same file becomes `data-fragment` alone. An external
 * http(s) link becomes a `data-external` reference the host opens on an explicit
 * click. Everything else — `file:`, `javascript:`, `data:`, custom protocols — is
 * rendered as inert text with a visible note, so nothing is silently dropped and
 * nothing unsafe is silently clickable.
 *
 * Headings get GitHub-style ids (lowercase, punctuation dropped, spaces as
 * hyphens, `-1`, `-2` for repeats), prefixed `user-content-` so a heading can
 * never shadow a property of the page. A `#fragment` names the unprefixed form,
 * so links written for GitHub keep working here.
 */

export type LinkTarget =
  /** A path inside the project, resolved from the linking file. */
  | { kind: 'internal'; path: string; fragment: string | null }
  /** A heading in the same file. */
  | { kind: 'anchor'; fragment: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked'; raw: string }

const HEADING_ID_PREFIX = 'user-content-'

/** GitHub's heading slug, which is what people write fragments against. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/** The element id a fragment points at, or null when it cannot name one. */
export function headingIdFor(fragment: string): string | null {
  const slug = headingSlug(fragment)
  return slug ? `${HEADING_ID_PREFIX}${slug}` : null
}

/** Decodes percent-escapes exactly once; malformed escapes are refused, not guessed. */
function decodeOnce(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

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

  // Any other scheme, protocol-relative URL, absolute path, or Windows
  // separator is refused. Markdown links use forward slashes.
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\')
  ) {
    return { kind: 'blocked', raw: trimmed }
  }

  const hashAt = trimmed.indexOf('#')
  const pathPart = hashAt === -1 ? trimmed : trimmed.slice(0, hashAt)
  const rawFragment = hashAt === -1 ? '' : trimmed.slice(hashAt + 1)
  const fragment = rawFragment ? decodeOnce(rawFragment) : null
  if (rawFragment && fragment === null) return { kind: 'blocked', raw: trimmed }

  if (pathPart.length === 0) {
    return fragment ? { kind: 'anchor', fragment } : { kind: 'blocked', raw: trimmed }
  }

  // Resolve relative to the linking file, then reject anything that climbs out
  // of the project. The host validates the result again before opening it.
  const base = fromPath.split('/').slice(0, -1)
  const resolved: string[] = []
  for (const encoded of [...base, ...pathPart.split('/')]) {
    const segment = decodeOnce(encoded)
    // An escaped separator would smuggle in a path the link did not write.
    if (segment === null || segment.includes('/') || segment.includes('\\')) {
      return { kind: 'blocked', raw: trimmed }
    }
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
    : { kind: 'internal', path: resolved.join('/'), fragment }
}

export interface RenderedDocument {
  html: string
  frontmatter: string
}

export function renderMarkdown(source: string, fromPath: string): RenderedDocument {
  const { frontmatter, body } = splitFrontmatter(source)

  const renderer = new marked.Renderer()

  // Repeated headings get -1, -2 like GitHub, counted per rendered document.
  const seenSlugs = new Map<string, number>()
  renderer.heading = ({ tokens, depth }) => {
    const inner = renderer.parser.parseInline(tokens)
    const base = headingSlug(plainText(inner))
    const repeats = seenSlugs.get(base) ?? 0
    seenSlugs.set(base, repeats + 1)
    const slug = repeats === 0 ? base : `${base}-${repeats}`
    const id = slug ? ` id="${HEADING_ID_PREFIX}${escapeAttribute(slug)}"` : ''
    return `<h${depth}${id}>${inner}</h${depth}>\n`
  }

  renderer.link = ({ href, title, tokens }) => {
    const text = renderer.parser.parseInline(tokens)
    const target = classifyLink(href ?? '', fromPath)
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : ''

    switch (target.kind) {
      case 'internal': {
        const fragment = target.fragment
          ? ` data-fragment="${escapeAttribute(target.fragment)}"`
          : ''
        return `<a href="#" data-link="${escapeAttribute(target.path)}"${fragment}${titleAttribute}>${text}</a>`
      }
      case 'anchor':
        return `<a href="#" data-fragment="${escapeAttribute(target.fragment)}"${titleAttribute}>${text}</a>`
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
      ADD_ATTR: ['data-link', 'data-fragment', 'data-external'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base'],
      FORBID_ATTR: ['srcset', 'formaction', 'style'],
    }),
  }
}

/** Heading text as a reader sees it, for its slug. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name] ?? '',
    )
}

function escapeAttribute(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
