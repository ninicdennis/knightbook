import { useCallback, useEffect, useRef, useState } from 'react'

/** What a link asks for: a project-relative path and an optional heading. */
export interface LinkRequest {
  path: string
  fragment: string | null
}

/** Where the reader was when they followed a link, so they can go back. */
export type LinkPlace =
  { kind: 'document'; path: string } | { kind: 'ticket'; id: string; title: string }

/** A heading to bring into view once the destination renders. */
export interface ScrollTarget {
  fragment: string
  /** Changes on every request, so following the same link twice scrolls twice. */
  nonce: number
}

interface Options {
  rootPath: string | null
  openDocument: (path: string, scrollTo: ScrollTarget | null) => void
  openTicket: (id: string, scrollTo: ScrollTarget | null) => void
}

function keyOf(
  place: LinkPlace | { kind: 'document'; path: string } | { kind: 'ticket'; id: string },
) {
  return place.kind === 'document' ? `document:${place.path}` : `ticket:${place.id}`
}

/**
 * Following in-project links between documents and tickets.
 *
 * The host decides what a path is; the window only asks. A reply that arrives
 * after the user switched project or followed another link is dropped, so a slow
 * answer cannot replace what they are now looking at. Following a link changes
 * nothing on disk: no status, review or document inclusion.
 *
 * One step back is kept, for the place the last link was followed from. It is
 * offered only while the reader is still on that link's destination, so it never
 * appears somewhere it would not make sense. This is not browser history.
 */
export function useLinkNavigation({ rootPath, openDocument, openTicket }: Options) {
  const latest = useRef(0)
  const [back, setBack] = useState<{ from: LinkPlace; at: string } | null>(null)

  // A different project starts with no way back and no pending answers.
  useEffect(() => {
    latest.current += 1
    setBack(null)
  }, [rootPath])

  const follow = useCallback(
    async (from: LinkPlace, request: LinkRequest): Promise<string | null> => {
      if (!rootPath) return null
      const attempt = (latest.current += 1)
      const result = await window.knightbook.resolveLink(rootPath, request.path)
      if (attempt !== latest.current) return null

      if (!result.ok) return `That link could not be followed: ${result.message}`
      const destination = result.value
      if (destination.kind === 'unavailable') return destination.message

      const scrollTo = request.fragment ? { fragment: request.fragment, nonce: Date.now() } : null
      const at = keyOf(destination)
      // Following a link to where you already are only scrolls; there is no
      // earlier place to go back to.
      if (at !== keyOf(from)) setBack({ from, at })

      if (destination.kind === 'ticket') openTicket(destination.id, scrollTo)
      else openDocument(destination.path, scrollTo)
      return null
    },
    [rootPath, openDocument, openTicket],
  )

  /** The way back from `here`, if the last link followed led to it. */
  const backFrom = useCallback(
    (here: { kind: 'document'; path: string } | { kind: 'ticket'; id: string }) =>
      back && back.at === keyOf(here) ? back.from : null,
    [back],
  )

  const goBack = useCallback(
    (place: LinkPlace) => {
      setBack(null)
      if (place.kind === 'ticket') openTicket(place.id, null)
      else openDocument(place.path, null)
    },
    [openDocument, openTicket],
  )

  return { follow, backFrom, goBack }
}
