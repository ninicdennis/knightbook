import { useDisclosure } from '@mantine/hooks'
import { useCallback, useState } from 'react'
import type { ArchiveOutcome, Result, TicketStatus } from '../../shared/contract.js'
import type { ScreenControls } from '../app/screen.js'

/**
 * Taking tickets off the board, one at a time or a whole column. It has its own
 * path rather than the one other board mutations share, for the reason given on
 * `applyArchive` below.
 */
export function useArchiveActions({
  screen,
  setScreen,
  setActionError,
  setBusyTicketId,
}: ScreenControls) {
  /*
   * Archiving a column touches many files in sequence, and `busyTicketId` names
   * a single card, so it cannot stand for "a bulk operation is running". Without
   * this the project switcher stays enabled through a bulk archive and could
   * redirect it halfway.
   */
  const [archiving, setArchiving] = useState(false)
  const [pendingArchiveColumn, setPendingArchiveColumn] = useState<TicketStatus | null>(null)
  const [archiveOpen, archiveDialog] = useDisclosure(false)

  /**
   * Archiving reports per-ticket outcomes rather than a single success, because
   * each ticket is its own file and its own write. A partial result is a real
   * answer, not an error: what was archived stays archived, and the rest are
   * named so the user can see which ones to look at.
   */
  const applyArchive = useCallback(
    async (ticketId: string | null, run: () => Promise<Result<ArchiveOutcome>>) => {
      if (screen.kind !== 'open') return
      setBusyTicketId(ticketId)
      setArchiving(true)
      setActionError(null)

      const result = await run()
      if (!result.ok) {
        setActionError(result.message)
        setBusyTicketId(null)
        setArchiving(false)
        return
      }

      const { archivedCount, failures, project } = result.value
      setScreen({ kind: 'open', path: screen.path, project })
      if (failures.length > 0) {
        const names = failures.map((failure) => `"${failure.title}"`).join(', ')
        setActionError(
          `Archived ${archivedCount} of ${archivedCount + failures.length}. ` +
            `${failures.length === 1 ? 'This one was' : 'These were'} left alone because ${
              failures.length === 1 ? 'it' : 'they'
            } changed while you were deciding: ${names}. Nothing was lost; try again.`,
        )
      }
      setBusyTicketId(null)
      setArchiving(false)
    },
    [screen, setScreen, setActionError, setBusyTicketId],
  )

  /**
   * Archiving one ticket. Unlike accepting it as done, this records no decision
   * about the work, so it does not need a confirmation of its own: the Archive
   * tab shows exactly what happened and Restore undoes it.
   */
  const archiveOne = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void applyArchive(ticketId, async () => {
        const result = await window.knightbook.archiveTickets(screen.path, [
          { id: ticket.id, revision: ticket.revision },
        ])
        return result
      })
    },
    [screen, applyArchive],
  )

  /**
   * Archiving a column moves work the user is not inspecting one item at a
   * time, so it always goes through a confirmation that names the column and
   * the exact count.
   */
  const askToArchiveColumn = useCallback(
    (status: TicketStatus) => {
      setPendingArchiveColumn(status)
      archiveDialog.open()
    },
    [archiveDialog],
  )

  const archiveColumnTickets =
    screen.kind === 'open' && pendingArchiveColumn
      ? screen.project.tickets.filter((t) => t.status === pendingArchiveColumn)
      : []

  const archiveColumnConfirmed = useCallback(() => {
    if (screen.kind !== 'open' || !pendingArchiveColumn) return
    /*
     * The set is captured here, from what the board was showing when the user
     * confirmed. A ticket created or changed after that is either absent from
     * this list or refused by revision, so a bulk action can never quietly take
     * something the user never saw.
     */
    const targets = screen.project.tickets
      .filter((t) => t.status === pendingArchiveColumn)
      .map((t) => ({ id: t.id, revision: t.revision }))

    archiveDialog.close()
    setPendingArchiveColumn(null)
    if (targets.length === 0) return

    void applyArchive(null, () => window.knightbook.archiveTickets(screen.path, targets))
  }, [screen, pendingArchiveColumn, archiveDialog, applyArchive])

  return {
    archiving,
    archiveOne,
    askToArchiveColumn,
    archiveColumn: {
      opened: archiveOpen,
      status: pendingArchiveColumn,
      tickets: archiveColumnTickets,
      close: archiveDialog.close,
      confirm: archiveColumnConfirmed,
    },
  }
}
