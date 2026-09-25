import { Alert, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconThumbDown } from '@tabler/icons-react'
import type { TicketView } from '../../shared/contract.js'

/**
 * Decision D-017, on the ticket detail. Two separate facts that must not be
 * collapsed into one: this ticket failed verification, or this ticket's work
 * rests on one that did. Both say plainly that nothing was moved, because the
 * design leaves every rework decision to the user.
 */

export function VerificationIssueNotice({ ticket }: { ticket: TicketView }) {
  const issue = ticket.verificationIssue

  return (
    <>
      {issue && (
        <Alert
          icon={<IconThumbDown size={16} />}
          color="orange"
          variant="light"
          title="Did not pass verification"
        >
          <Stack gap={4}>
            <Text size="sm">{issue.reason}</Text>
            <Text size="xs" c="dimmed">
              {issue.recordedBy === 'agent'
                ? 'You told an AI tool this was not accepted and it recorded your decision; it did not decide this itself.'
                : 'Recorded by you in the app.'}{' '}
              Its status was left where it is, and so was every ticket depending on it.
            </Text>
          </Stack>
        </Alert>
      )}

      {ticket.affectedBy.length > 0 && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          title="Affected by a failed verification"
        >
          <Stack gap={6}>
            {ticket.affectedBy.map((failed) => (
              <Text key={failed.ticketId} size="sm">
                <Text span fw={600}>
                  {failed.title}
                </Text>
                {failed.direct ? '' : ' (further up the chain)'}: {failed.issue}
              </Text>
            ))}
            <Text size="xs" c="dimmed">
              This work rests on something that was not accepted, so it is not suggested as the next
              ticket. Nothing here was changed for you; what to rework is your call.
            </Text>
          </Stack>
        </Alert>
      )}
    </>
  )
}
