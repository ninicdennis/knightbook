import { useDisclosure } from '@mantine/hooks'
import { useCallback, useState } from 'react'
import type { MovableStatus, ProjectView, Result, TicketType } from '../../shared/contract.js'
import type { ScreenControls } from '../screen.js'

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
    async (ticketId: string, run: () => Promise<Result<ProjectView>>) => {
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
        setActionError(
          'That ticket changed somewhere else, so your move was not applied. ' +
            'This is the current version.',
        )
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

  /**
   * Manual backlog order. The whole backlog is sent in its new order rather than
   * a single move, so the host writes one list and the window never has to guess
   * what the manifest already held.
   */
  const reorder = useCallback(
    (ticketId: string, to: 'top' | 'up' | 'down') => {
      if (screen.kind !== 'open') return

      const ids = screen.project.tickets
        .filter((candidate) => candidate.status === 'backlog')
        .map((candidate) => candidate.id)
      const from = ids.indexOf(ticketId)
      if (from === -1) return

      const target = to === 'top' ? 0 : to === 'up' ? from - 1 : from + 1
      if (target < 0 || target >= ids.length) return

      const next = [...ids]
      next.splice(from, 1)
      next.splice(target, 0, ticketId)
      void apply(ticketId, () => window.knightbook.reorderBacklog(screen.path, next))
    },
    [screen, apply],
  )

  /**
   * Recording a review is the user confirming they have read the content. It is
   * informational and reversible in effect — a later meaningful edit sets it
   * back — so unlike completion it needs no confirmation step.
   */
  const review = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      void apply(ticketId, () => window.knightbook.recordTicketReview(screen.path, ticketId, ''))
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
