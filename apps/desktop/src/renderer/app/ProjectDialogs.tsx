import { ArchiveColumnDialog } from '../board/ArchiveColumnDialog.js'
import type { useArchiveActions } from '../board/useArchiveActions.js'
import { NewTicketDialog } from '../tickets/NewTicketDialog.js'
import type { useNewTicket } from '../tickets/useNewTicket.js'
import type { useTicketActions } from '../tickets/useTicketActions.js'
import { CompletionDialog } from '../verification/CompletionDialog.js'
import { VerificationIssueDialog } from '../verification/VerificationIssueDialog.js'

interface Props {
  actions: ReturnType<typeof useTicketActions>
  archive: ReturnType<typeof useArchiveActions>
  newTicket: ReturnType<typeof useNewTicket>
}

/** The confirmation and creation dialogs the board's actions open over any view. */
export function ProjectDialogs({ actions, archive, newTicket }: Props) {
  return (
    <>
      <ArchiveColumnDialog
        opened={archive.archiveColumn.opened}
        status={archive.archiveColumn.status}
        tickets={archive.archiveColumn.tickets}
        onClose={archive.archiveColumn.close}
        onConfirm={archive.archiveColumn.confirm}
      />

      <NewTicketDialog
        opened={newTicket.opened}
        saving={newTicket.saving}
        error={newTicket.error}
        onClose={newTicket.close}
        onCreate={newTicket.create}
      />

      <CompletionDialog
        opened={actions.completion.opened}
        ticket={actions.completion.ticket}
        onClose={actions.completion.close}
        onConfirm={actions.completion.confirm}
      />

      <VerificationIssueDialog
        opened={actions.issue.opened}
        ticket={actions.issue.ticket}
        onClose={actions.issue.close}
        onConfirm={actions.issue.confirm}
      />
    </>
  )
}
