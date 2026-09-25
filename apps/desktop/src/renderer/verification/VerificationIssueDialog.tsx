import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TicketView } from '../../shared/contract.js'

/**
 * Decision D-017. Saying the work was not accepted is a decision the same way
 * accepting it is, so it is recorded deliberately and with a reason: the reason
 * is what the people whose work rests on this ticket will actually read.
 *
 * The dialog is explicit that nothing moves. Dependent tickets are flagged and
 * stop being suggested, and every status stays where it is, because deciding
 * what to rework belongs to the user.
 */

interface Props {
  opened: boolean
  ticket: TicketView | undefined
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function VerificationIssueDialog({ opened, ticket, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('')

  // A reason belongs to the ticket it was typed for, so opening the dialog on a
  // different card must not inherit the last one.
  useEffect(() => {
    if (opened) setReason('')
  }, [opened, ticket?.id])

  const trimmed = reason.trim()

  return (
    <Modal opened={opened} onClose={onClose} title="What did not pass verification?" centered>
      <Stack gap="md">
        <Text size="sm">{ticket?.title}</Text>
        <Textarea
          label="Reason"
          description="Written onto this ticket, and shown on the work that depends on it."
          placeholder="What you found, and what needs to change."
          rows={4}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          data-autofocus
        />
        <Text size="xs" c="dimmed">
          Nothing is moved or reset. Tickets depending on this one are flagged and stop being
          suggested until you resolve the issue.
        </Text>
        {ticket && ticket.status !== 'verification' && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
            This ticket is in {ticket.status.replace('_', ' ')}, not Verification. The change will
            be refused.
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="orange" disabled={trimmed.length === 0} onClick={() => onConfirm(trimmed)}>
            Record the issue
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
