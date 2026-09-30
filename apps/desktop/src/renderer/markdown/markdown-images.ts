import { classifyLink } from './link-target.js'

/**
 * Turns every image in rendered Markdown into an inert placeholder, before the
 * HTML is sanitized or shown.
 *
 * Both forms go through here: Markdown's `![alt](path)` and a raw `<img>` in the
 * document, such as the logo at the top of a README. A relative path is resolved
 * against the file it appears in, exactly as a link is, and becomes a
 * `data-image` placeholder that `useProjectImages` asks the host to fill. The
 * host decides whether it may be shown. Anything else (http, https,
 * protocol-relative, `data:`, other schemes, absolute paths) stays a visible note
 * and is never requested, so opening a document cannot reach the network.
 *
 * This runs on a document from `DOMParser`, which is inert: nothing in it loads,
 * so reading the `src` here fetches nothing.
 */

/** Only plain pixel sizes carry over, so an attribute cannot smuggle in anything else. */
const PIXELS = /^\d{1,4}$/

export function replaceImages(html: string, fromPath: string): string {
  if (!/<img/i.test(html)) return html
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  for (const image of Array.from(document.body.querySelectorAll('img'))) {
    const src = image.getAttribute('src') ?? ''
    const alt = image.getAttribute('alt') ?? ''
    const target = classifyLink(src, fromPath)
    const placeholder = document.createElement('span')

    if (target.kind === 'internal') {
      placeholder.className = 'project-image'
      placeholder.setAttribute('data-image', target.path)
      placeholder.setAttribute('data-image-alt', alt)
      for (const dimension of ['width', 'height']) {
        const value = image.getAttribute(dimension)
        if (value && PIXELS.test(value)) placeholder.setAttribute(`data-image-${dimension}`, value)
      }
      placeholder.textContent = `[image: ${alt || target.path}]`
    } else {
      placeholder.className = 'blocked-image'
      const why =
        target.kind === 'external' || src.trim().startsWith('//')
          ? 'remote images are not loaded'
          : 'only images inside this project are shown'
      placeholder.setAttribute('title', `This image was not shown: ${src}`)
      placeholder.textContent = `[image: ${alt || src || 'untitled'} — ${why}]`
    }

    image.replaceWith(placeholder)
  }

  return document.body.innerHTML
}
