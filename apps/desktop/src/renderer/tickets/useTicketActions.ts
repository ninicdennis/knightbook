import { useDisclosure } from '@mantine/hooks'
import { useCallback, useState } from 'react'
import type { MovableStatus, ProjectView, Result, TicketType } from '../../shared/contract.js'
import type { TicketContentEdit, TicketLinksEdit } from '../../shared/ticket-edit-contract.js'
import type { ScreenControls } from '../projects/screen.js'
import { moveInBacklog, type BacklogMove } from '../board/column-filter/backlog-move.js'

/**
 * Every change the board makes to a ticket, and the one path they share. Each
 * goes through `apply`, which is what gives them the same busy state, error
 * message and conflict handling, so they live together with it.
 *
 * Completing a ticket and reporting a failed verification each need a dialog
 * first, so the dialog's state lives here beside the action it confirms.
 */
export function useTicketActions({
  screen,
  setScreen,
  load,
  setActionError,
  setBusyTicketId,
}: ScreenControls) {
  const [pendingCompletion, setPendingCompletion] = useState<string | null>(null)
  const [confirmOpen, confirm] = useDisclosure(false)
  const [pendingIssue, setPendingIssue] = useState<string | null>(null)
  const [issueOpen, issueDialog] = useDisclosure(false)

  /** Applies a mutation, then replaces the whole view with what the files now say. */
  const apply = useCallback(
    async (
      ticketId: string,
      run: () => Promise<Result<ProjectView>>,
      conflictMessage = 'That ticket changed somewhere else, so your move was not applied. ' +
        'This is the current version.',
    ) => {
      if (screen.kind !== 'open') return
      setBusyTicketId(ticketId)
      setActionError(null)

      const result = await run()
      if (result.ok) {
        setScreen({ kind: 'open', path: screen.path, project: result.value })
      } else if (result.code === 'revision_conflict') {
        // Reload first: load() clears any standing message, so the explanation
        // has to be set afterwards or the board would refresh silently.
        await load(screen.path)
        setActionError(conflictMessage)
      } else {
        setActionError(result.message)
      }
      setBusyTicketId(null)
    },
    [screen, load, setScreen, setActionError, setBusyTicketId],
  )

  const move = useCallback(
    (ticketId: string, status: MovableStatus) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.setTicketStatus(screen.path, ticketId, status, ticket.revision),
      )
    },
    [screen, apply],
  )

  /**
   * The work type is metadata about the ticket, not a decision about it, so it
   * applies straight away like a move does. The dialog stays open: the user is
   * usually still reading the ticket they just classified.
   */
  const setType = useCallback(
    (ticketId: string, type: TicketType | null) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.setTicketType(screen.path, ticketId, type, ticket.revision),
      )
    },
    [screen, apply],
  )

  /** The blocker is written the same way as the type: straight away, dialog left open. */
  const setBlocker = useCallback(
    (ticketId: string, blocker: string | null) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(
        ticketId,
        () => window.knightbook.setTicketBlocker(screen.path, ticketId, blocker, ticket.revision),
        'That ticket changed somewhere else, so the blocker was not saved. ' +
          'This is the current version.',
      )
    },
    [screen, apply],
  )

  /**
   * Saves from an editor in the detail dialog. Unlike the other edits this hands
   * the result back, because a refused save must keep the user's draft in the
   * editor and explain itself there rather than in a board-level message behind
   * the dialog. On a conflict the board is reloaded so the dialog shows the
   * version that won.
   */
  const saveFromDialog = useCallback(
    async (run: (rootPath: string) => Promise<Result<ProjectView>>) => {
      if (screen.kind !== 'open') {
        return { ok: false as const, code: 'not_open', message: 'No project is open.' }
      }
      const result = await run(screen.path)
      if (result.ok) setScreen({ kind: 'open', path: screen.path, project: result.value })
      else if (result.code === 'revision_conflict') await load(screen.path)
      return result
    },
    [screen, load, setScreen],
  )

  const editContent = useCallback(
    (ticketId: string, content: TicketContentEdit, revision: string) =>
      saveFromDialog((path) =>
        window.knightbook.editTicketContent(path, ticketId, content, revision),
      ),
    [saveFromDialog],
  )

  const editLinks = useCallback(
    (ticketId: string, links: TicketLinksEdit, revision: string) =>
      saveFromDialog((path) => window.knightbook.setTicketLinks(path, ticketId, links, revision)),
    [saveFromDialog],
  )

  /**
   * Manual backlog order. The whole backlog is sent in its new order rather than
   * a single move, so the host writes one list and the window never has to guess
   * what the manifest already held. `visible` is the backlog as the board draws
   * it, so a move in a filtered column steps past the cards the user can see.
   */
  const reorder = useCallback(
    (ticketId: string, to: BacklogMove, visible?: readonly string[]) => {
      if (screen.kind !== 'open') return

      const ids = screen.project.tickets
        .filter((candidate) => candidate.status === 'backlog')
        .map((candidate) => candidate.id)
      const next = moveInBacklog(ids, ticketId, to, visible)
      if (!next) return
      void apply(ticketId, () => window.knightbook.reorderBacklog(screen.path, next))
    },
    [screen, apply],
  )

  /**
   * Recording a review is the user confirming they have read the content. It is
   * informational and reversible in effect — a later meaningful edit sets it
   * back — so unlike completion it needs no confirmation step.
   *
   * It names the revision the user was shown: the detail view passes the one it
   * displayed, and a card falls back to the board's. Anything newer is refused.
   */
  const review = useCallback(
    (ticketId: string, revision?: string) => {
      if (screen.kind !== 'open') return
      const shown = revision ?? screen.project.tickets.find((t) => t.id === ticketId)?.revision
      void apply(
        ticketId,
        () => window.knightbook.recordTicketReview(screen.path, ticketId, '', shown),
        'That ticket changed after you opened it, so the review was not recorded. ' +
          'This is the current version; review it again.',
      )
    },
    [screen, apply],
  )

  /**
   * Moving a card into Done records the user's completion decision, so an
   * accidental drag must not be able to do it silently. The confirmation is
   * about the gesture, not a second approval of the work.
   */
  const askToComplete = useCallback(
    (ticketId: string) => {
      setPendingCompletion(ticketId)
      confirm.open()
    },
    [confirm],
  )

  const completeConfirmed = useCallback(() => {
    if (screen.kind !== 'open' || !pendingCompletion) return
    const ticket = screen.project.tickets.find((t) => t.id === pendingCompletion)
    confirm.close()
    if (!ticket) return

    void apply(ticket.id, () =>
      window.knightbook.completeTicket(screen.path, ticket.id, ticket.revision),
    )
    setPendingCompletion(null)
  }, [screen, pendingCompletion, apply, confirm])

  const pendingTicket =
    screen.kind === 'open' && pendingCompletion
      ? screen.project.tickets.find((t) => t.id === pendingCompletion)
      : undefined

  const restore = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.archivedTickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.restoreTicket(screen.path, ticket.id, ticket.revision),
      )
    },
    [screen, apply],
  )

  /**
   * D-017: recording a failed verification needs the reason, so it always goes
   * through the dialog. Nothing downstream changes; dependents are flagged from
   * this ticket's own record when the board is read back.
   */
  const askAboutIssue = useCallback(
    (ticketId: string) => {
      setPendingIssue(ticketId)
      issueDialog.open()
    },
    [issueDialog],
  )

  const issueConfirmed = useCallback(
    (reason: string) => {
      if (screen.kind !== 'open' || !pendingIssue) return
      const ticket = screen.project.tickets.find((t) => t.id === pendingIssue)
      issueDialog.close()
      if (!ticket) return

      void apply(ticket.id, () =>
        window.knightbook.recordVerificationIssue(screen.path, ticket.id, ticket.revision, reason),
      )
      setPendingIssue(null)
    },
    [screen, pendingIssue, apply, issueDialog],
  )

  /** Clearing the issue un-flags every dependent at once, so it reads back immediately. */
  const resolveIssue = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.resolveVerificationIssue(screen.path, ticketId, ticket.revision),
      )
    },
    [screen, apply],
  )

  const pendingIssueTicket =
    screen.kind === 'open' && pendingIssue
      ? screen.project.tickets.find((t) => t.id === pendingIssue)
      : undefined

  return {
    move,
    setType,
    setBlocker,
    editContent,
    editLinks,
    reorder,
    review,
    restore,
    resolveIssue,
    askToComplete,
    askAboutIssue,
    completion: {
      opened: confirmOpen,
      ticket: pendingTicket,
      close: confirm.close,
      confirm: completeConfirmed,
    },
    issue: {
      opened: issueOpen,
      ticket: pendingIssueTicket,
      close: issueDialog.close,
      confirm: issueConfirmed,
    },
  }
}
