import { Alert, Group, Loader, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { TicketView } from '../../../shared/contract.js'
import { VerificationIssueNotice } from '../../verification/VerificationIssueNotice.js'
import { CompletionRecord } from './TicketDetailSections.js'

/**
 * What the dialog says about the ticket's state before its content: a failed
 * verification, who accepted it (or that nobody on record did), and whether its
 * own file could be read yet. Missing content is said to be missing or loading,
 * never shown as an empty ticket.
 */
export function TicketDetailNotices({
  ticket,
  error,
  loading,
}: {
  ticket: TicketView
  /** Why the fresh read failed, or null. */
  error: string | null
  loading: boolean
}) {
  return (
    <>
      <VerificationIssueNotice ticket={ticket} />

      {ticket.completionUnattributed && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          title="Unattributed"
        >
          This was set to Done outside the app, with no recorded decision from the app or an AI
          tool. Nothing here shows who accepted it.
        </Alert>
      )}

      {ticket.completion && <CompletionRecord completion={ticket.completion} />}

      {error && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          title="Could not read this ticket"
        >
          {error} Nothing was changed.
        </Alert>
      )}

      {loading && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Reading the ticket…
          </Text>
        </Group>
      )}
    </>
  )
}
