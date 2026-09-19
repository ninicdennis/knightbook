import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { TicketView } from '../../shared/contract.js'

/**
 * Moving a card into Done records the user's completion decision, so an
 * accidental drag must not be able to do it silently. The confirmation is about
 * the gesture, not a second approval of the work.
 */

interface Props {
  opened: boolean
  ticket: TicketView | undefined
  onClose: () => void
  onConfirm: () => void
}

export function CompletionDialog({ opened, ticket, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Accept this as done?" centered>
      <Stack gap="md">
        <Text size="sm">{ticket?.title}</Text>
        <Text size="sm" c="dimmed">
          This records that you accepted the work. It is saved as your own decision, separately from
          anything an AI tool reported.
        </Text>
        {ticket && ticket.status !== 'verification' && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
            This ticket is in {ticket.status.replace('_', ' ')}, not Verification. The change will be
            refused.
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="teal" onClick={onConfirm}>
            Accept as done
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
