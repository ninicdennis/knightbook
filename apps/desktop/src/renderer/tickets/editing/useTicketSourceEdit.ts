import { useCallback, useState } from 'react'
import type { ProjectView, Result } from '../../../shared/contract.js'
import type { TicketContentEdit } from '../../../shared/ticket-edit-contract.js'

/**
 * The state of editing a ticket's title and body as source. The draft is held
 * here rather than in the editor so that the dialog can ask before closing on
 * unsaved text, and so a refused save keeps every word the user typed.
 */

/** What the editor was opened on: the text shown and the revision it was read at. */
interface EditBase extends TicketContentEdit {
  revision: string
}

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  /** The file changed after the editor opened; nothing was written. */
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string }

/** Why the user is being asked to confirm throwing the draft away. */
export type DiscardReason = 'cancel' | 'close'

const toLineFeeds = (text: string): string => text.replace(/\r\n/g, '\n')

export function useTicketSourceEdit(
  save: (content: TicketContentEdit, revision: string) => Promise<Result<ProjectView>>,
) {
  const [base, setBase] = useState<EditBase | null>(null)
  const [draft, setDraft] = useState<TicketContentEdit | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [confirmDiscard, setConfirmDiscard] = useState<DiscardReason | null>(null)

  // A text area hands back `\n` whatever the file used, so endings alone are not an edit.
  const dirty =
    base !== null &&
    draft !== null &&
    (draft.title !== base.title || toLineFeeds(draft.body) !== toLineFeeds(base.body))

  const start = useCallback((opened: EditBase) => {
    setBase(opened)
    setDraft({ title: opened.title, body: opened.body })
    setSaveState({ kind: 'idle' })
    setConfirmDiscard(null)
  }, [])

  const stop = useCallback(() => {
    setBase(null)
    setDraft(null)
    setSaveState({ kind: 'idle' })
    setConfirmDiscard(null)
  }, [])

  const submit = useCallback(async () => {
    if (base === null || draft === null) return
    // Saving unchanged text must not touch the file, so it never reaches the host.
    if (!dirty) {
      stop()
      return
    }
    setSaveState({ kind: 'saving' })
    const result = await save({ title: draft.title.trim(), body: draft.body }, base.revision)
    if (result.ok) stop()
    else if (result.code === 'revision_conflict') setSaveState({ kind: 'conflict' })
    else setSaveState({ kind: 'failed', message: result.message })
  }, [base, draft, dirty, save, stop])

  /** Leaves the editor, or asks first when that would lose typed text. */
  const leave = useCallback(
    (reason: DiscardReason, then: () => void = stop) => {
      if (dirty) setConfirmDiscard(reason)
      else then()
    },
    [dirty, stop],
  )

  return {
    editing: draft !== null,
    draft,
    setDraft,
    dirty,
    saveState,
    confirmDiscard,
    start,
    stop,
    submit,
    leave,
    keepEditing: () => setConfirmDiscard(null),
  }
}

export type TicketSourceEdit = ReturnType<typeof useTicketSourceEdit>
