import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { MovableStatus, TicketStatus, TicketView } from '../../shared/contract.js'
import { STATUS_LABEL } from '../theme/theme.js'

/**
 * Archiving a whole column is the one action here that moves work the user is
 * not looking at one item at a time, so it says exactly which column, exactly
 * how many tickets, and what archiving does and does not mean.
 *
 * The count comes from the tickets passed in, which are the ones the board was
 * showing. Anything created after this opened is not in that set and will not
 * be swept up.
 */

interface Props {
  opened: boolean
  status: TicketStatus | null
  tickets: TicketView[]
  onClose: () => void
  onConfirm: () => void
}

/** Statuses that mean the work is not finished. */
const UNFINISHED: MovableStatus[] = ['backlog', 'in_progress']

export function ArchiveColumnDialog({ opened, status, tickets, onClose, onConfirm }: Props) {
  const count = tickets.length
  const unfinished = status && UNFINISHED.includes(status as MovableStatus) ? tickets : []

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={status ? `Archive all in ${STATUS_LABEL[status]}?` : 'Archive column'}
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          {/* The exact number and the exact column, because this is the sentence
              the user is agreeing to. */}
          This will archive <strong>{count}</strong> {count === 1 ? 'ticket' : 'tickets'} from{' '}
          <strong>{status ? STATUS_LABEL[status] : 'this column'}</strong>.
        </Text>

        <Text size="sm" c="dimmed">
          Nothing is deleted. Each ticket keeps its file, its history, its links and any recorded
          acceptance, and stays searchable. You can restore it from the Archive tab.
        </Text>

        {unfinished.length > 0 && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Stack gap={6}>
              <Text size="sm">
                This work is not finished. Archiving does not complete it and does not accept it:
                each ticket keeps the status it has now.
              </Text>
              <Text size="sm">
                While archived they leave the board and are never suggested as the next ticket. Any
                unfinished ticket here that something else depends on still blocks that work.
              </Text>
            </Stack>
          </Alert>
        )}

        {count > 0 && count <= 8 && (
          <List size="xs" c="dimmed" spacing={2}>
            {tickets.map((ticket) => (
              <List.Item key={ticket.id}>{ticket.title}</List.Item>
            ))}
          </List>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="orange" onClick={onConfirm} disabled={count === 0}>
            Archive {count} {count === 1 ? 'ticket' : 'tickets'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
