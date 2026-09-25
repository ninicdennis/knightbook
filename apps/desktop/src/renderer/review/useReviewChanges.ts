import { useCallback, useEffect, useState } from 'react'
import type { ReviewChangesView } from '../../shared/contract.js'

/**
 * Which record to compare: a document path or a ticket id. Null while the
 * changes view is not showing, so nothing is read for a closed view.
 */
export type ChangesSubject = { kind: 'document'; path: string } | { kind: 'ticket'; id: string }

export type ChangesLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; view: ReviewChangesView }

interface Loaded {
  /** The subject this answer is for, so another record's answer is never shown. */
  key: string
  load: ChangesLoad
}

/**
 * Loads the changes-since-review comparison for one record, and loads it again
 * whenever `version` changes. Callers pass the revision they currently hold, so
 * an edit picked up by a refresh replaces the comparison rather than leaving an
 * older one on screen.
 */
export function useReviewChanges(
  rootPath: string,
  subject: ChangesSubject | null,
  version: string,
) {
  const kind = subject?.kind ?? null
  const name = subject ? (subject.kind === 'document' ? subject.path : subject.id) : ''
  const key = `${rootPath}|${kind ?? ''}|${name}`

  const [loaded, setLoaded] = useState<Loaded>({ key: '', load: { status: 'idle' } })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!kind) return

    let cancelled = false
    const request =
      kind === 'document'
        ? window.knightbook.documentChanges(rootPath, name)
        : window.knightbook.ticketChanges(rootPath, name)

    void request.then((result) => {
      if (cancelled) return
      setLoaded({
        key,
        load: result.ok
          ? { status: 'ready', view: result.value }
          : { status: 'error', message: result.message },
      })
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, kind, name, key, version, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  // An answer for a different record, or none yet, reads as loading. A reload of
  // the same record keeps the last answer on screen until the new one arrives.
  const load: ChangesLoad = !kind
    ? { status: 'idle' }
    : loaded.key === key
      ? loaded.load
      : { status: 'loading' }
  return { load, reload }
}
