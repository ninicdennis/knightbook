import { useCallback, useEffect, useRef } from 'react'

/** What a link asks for: a project-relative path and an optional heading. */
export interface LinkRequest {
  path: string
  fragment: string | null
}

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

/**
 * Following in-project links between documents and tickets.
 *
 * The host decides what a path is; the window only asks. A reply that arrives
 * after the user switched project or followed another link is dropped, so a slow
 * answer cannot replace what they are now looking at. Following a link changes
 * nothing on disk: no status, review or document inclusion.
 *
 * The way back is the project's history (ticket 855c3054): opening the
 * destination adds a step there, and following a link to where you already
 * are only scrolls.
 */
export function useLinkNavigation({ rootPath, openDocument, openTicket }: Options) {
  const latest = useRef(0)

  // A different project has no pending answers.
  useEffect(() => {
    latest.current += 1
  }, [rootPath])

  const follow = useCallback(
    async (request: LinkRequest): Promise<string | null> => {
      if (!rootPath) return null
      const attempt = (latest.current += 1)
      const result = await window.knightbook.resolveLink(rootPath, request.path)
      if (attempt !== latest.current) return null

      if (!result.ok) return `That link could not be followed: ${result.message}`
      const destination = result.value
      if (destination.kind === 'unavailable') return destination.message

      const scrollTo = request.fragment ? { fragment: request.fragment, nonce: Date.now() } : null
      if (destination.kind === 'ticket') openTicket(destination.id, scrollTo)
      else openDocument(destination.path, scrollTo)
      return null
    },
    [rootPath, openDocument, openTicket],
  )

  return { follow }
}
