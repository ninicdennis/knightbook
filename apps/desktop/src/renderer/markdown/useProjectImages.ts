import { useEffect, type RefObject } from 'react'

/**
 * Fills the image placeholders in rendered Markdown with the images the host
 * agrees to show.
 *
 * Each `data-image` placeholder names a project-relative path. The host checks
 * it (inside the project, a PNG, JPEG, GIF or WebP by its bytes, under the size
 * cap) and returns a data URL, so the window never holds a file path it could
 * load from. An image the host refuses keeps its placeholder, which then says
 * why, so a missing picture never just disappears or shows as broken.
 */
export function useProjectImages(
  container: RefObject<HTMLElement | null>,
  html: string,
  rootPath: string,
): void {
  useEffect(() => {
    const node = container.current
    if (!node) return
    let cancelled = false

    for (const placeholder of Array.from(node.querySelectorAll<HTMLElement>('[data-image]'))) {
      const path = placeholder.getAttribute('data-image') ?? ''
      const alt = placeholder.getAttribute('data-image-alt') ?? ''

      void window.knightbook.readProjectImage(rootPath, path).then((result) => {
        if (cancelled || !placeholder.isConnected) return
        if (!result.ok) {
          showRefusal(placeholder, alt || path, `It could not be read: ${result.message}`)
        } else if (result.value.kind === 'image') {
          placeholder.replaceWith(imageFor(placeholder, result.value.dataUrl, alt))
        } else {
          showRefusal(placeholder, alt || path, result.value.message)
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [container, html, rootPath])
}

/** The placeholder stays, and now says why it is not the image. */
function showRefusal(placeholder: HTMLElement, label: string, why: string): void {
  placeholder.className = 'blocked-image'
  placeholder.title = why
  placeholder.textContent = `[image: ${label} — ${why}]`
}

function imageFor(placeholder: HTMLElement, dataUrl: string, alt: string): HTMLImageElement {
  const image = document.createElement('img')
  image.src = dataUrl
  image.alt = alt
  image.className = 'project-image'
  for (const dimension of ['width', 'height'] as const) {
    const value = placeholder.getAttribute(`data-image-${dimension}`)
    if (value) image.setAttribute(dimension, value)
  }
  return image
}
