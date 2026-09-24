import { Alert, Box } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { LinkRequest, ScrollTarget } from '../hooks/useLinkNavigation.js'
import { headingIdFor } from '../markdown.js'

interface Props {
  /** Already sanitized by renderMarkdown; never pass unsanitized HTML here. */
  html: string
  /**
   * Follows an in-project link. Resolves to a message for the reader when the
   * link could not be followed, or null when it was.
   */
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  /** A heading to bring into view once this content has rendered. */
  scrollTo?: ScrollTarget | null
  /** Smaller headings, for prose shown inside a dialog rather than a full page. */
  compact?: boolean
}

/**
 * Sanitized Markdown, with links that act only through this component.
 *
 * Links arrive inert: an in-project link carries `data-link` (and perhaps
 * `data-fragment`), a same-file heading link carries `data-fragment` alone, an
 * http(s) link carries `data-external`, and nothing has a live href. A crafted
 * document therefore cannot navigate the app or reach the filesystem on its own;
 * it can only ask for one of those named actions. Anchors keep `href="#"` so they
 * stay in the tab order and Enter activates them like a click.
 *
 * A link that could not be followed says why, here, where the reader clicked.
 */
export function MarkdownBody({ html, onFollowLink, scrollTo = null, compact = false }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const node = container.current
    if (!node) return

    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      event.preventDefault()
      setNotice(null)

      const path = anchor.getAttribute('data-link')
      const fragment = anchor.getAttribute('data-fragment')
      if (path) {
        void onFollowLink({ path, fragment }).then(setNotice)
        return
      }
      if (fragment) {
        if (!showHeading(node, fragment)) setNotice(missingHeading(fragment))
        return
      }
      const external = anchor.getAttribute('data-external')
      if (external) {
        void window.knightbook.openExternalLink(external).then((result) => {
          if (!result.ok) setNotice(`The link could not be opened: ${result.message}`)
        })
      }
    }

    node.addEventListener('click', handler)
    return () => node.removeEventListener('click', handler)
  }, [onFollowLink])

  // Arriving from a link that named a heading. The content stays readable from
  // the top when the heading is not there; the notice says so.
  useEffect(() => {
    const node = container.current
    if (!node || !scrollTo) return
    setNotice(showHeading(node, scrollTo.fragment) ? null : missingHeading(scrollTo.fragment))
  }, [html, scrollTo])

  return (
    <>
      {notice && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          mb="sm"
          withCloseButton
          closeButtonLabel="Dismiss"
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}
      <Box
        ref={container}
        className={compact ? 'markdown-body compact' : 'markdown-body'}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}

function missingHeading(fragment: string): string {
  return `There is no heading “${fragment}” here, so this is shown from the top.`
}

/** Scrolls to and focuses a heading, so keyboard and screen-reader users land there too. */
function showHeading(container: HTMLElement, fragment: string): boolean {
  const id = headingIdFor(fragment)
  // Searched within this body only: another open view can render the same ids.
  const heading = id
    ? Array.from(container.querySelectorAll<HTMLElement>('[id]')).find((node) => node.id === id)
    : undefined
  if (!heading) return false

  heading.setAttribute('tabindex', '-1')
  heading.scrollIntoView?.({ block: 'start' })
  heading.focus({ preventScroll: true })
  return true
}
