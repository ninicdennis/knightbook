import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { classifyLink } from './link-target.js'
import { replaceImages } from './markdown-images.js'

export { classifyLink, type LinkTarget } from './link-target.js'

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

/** Frontmatter is metadata, not prose; it is shown separately, not rendered. */
const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)?---[^\S\r\n]*(\r?\n)?/

export function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const match = FRONTMATTER.exec(source)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[1] ?? '', body: source.slice(match[0].length) }
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

  // Images could reach the network or the filesystem if left alone. They are
  // written as an ordinary <img> here, then every image, Markdown or raw HTML,
  // becomes an inert placeholder in one place (markdown-images.ts). Nothing is
  // loaded while rendering; the host fills in-project ones after its checks.
  renderer.image = ({ href, text }) =>
    `<img src="${escapeAttribute(href ?? '')}" alt="${escapeAttribute(text ?? '')}">`

  const html = replaceImages(marked.parse(body, { renderer, async: false, gfm: true }), fromPath)

  return {
    frontmatter,
    html: DOMPurify.sanitize(html, {
      ALLOWED_URI_REGEXP: /^#$/,
      ADD_ATTR: [
        'data-link',
        'data-fragment',
        'data-external',
        'data-image',
        'data-image-alt',
        'data-image-width',
        'data-image-height',
      ],
      // No <img> survives: every image was turned into a placeholder above, and
      // one that somehow was not must not reach the page as a live element.
      FORBID_TAGS: [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'form',
        'input',
        'base',
        'img',
        'picture',
        'source',
        'video',
        'audio',
      ],
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
