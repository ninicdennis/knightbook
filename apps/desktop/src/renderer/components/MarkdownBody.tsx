import { Box } from '@mantine/core'
import { useEffect, useRef } from 'react'

interface Props {
  /** Already sanitized by renderMarkdown; never pass unsanitized HTML here. */
  html: string
  onFollowLink: (path: string) => void
  /** Smaller headings, for prose shown inside a dialog rather than a full page. */
  compact?: boolean
}

/**
 * Sanitized Markdown, with links that act only through this component.
 *
 * Links arrive inert: an in-project link carries `data-document`, an http(s) link
 * carries `data-external`, and nothing has a live href. A crafted document
 * therefore cannot navigate the app or reach the filesystem on its own; it can
 * only ask for one of those two named actions.
 */
export function MarkdownBody({ html, onFollowLink, compact = false }: Props) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = container.current
    if (!node) return

    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      event.preventDefault()

      const documentPath = anchor.getAttribute('data-document')
      if (documentPath) {
        onFollowLink(documentPath)
        return
      }
      const external = anchor.getAttribute('data-external')
      if (external) void window.projectspace.openExternalLink(external)
    }

    node.addEventListener('click', handler)
    return () => node.removeEventListener('click', handler)
  }, [onFollowLink])

  return (
    <Box
      ref={container}
      className={compact ? 'markdown-body compact' : 'markdown-body'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
