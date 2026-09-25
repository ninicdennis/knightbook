import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { IconArchiveOff, IconInfoCircle } from '@tabler/icons-react'
import type { TicketView } from '../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme/theme.js'

/**
 * Tickets taken off the working board, newest first.
 *
 * A compact list rather than cards in columns: this is somewhere to look things
 * up, not somewhere to work, and laying it out like the board would invite
 * reading it as a fifth column. Each row still says what status the ticket kept,
 * because archiving decided nothing about the work.
 */

interface Props {
  tickets: TicketView[]
  busyTicketId: string | null
  onOpen: (id: string) => void
  onRestore: (id: string) => void
}

/** The archive date, in the reader's own locale, without a false sense of precision. */
function archivedOn(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime())
    ? iso
    : when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ArchiveView({ tickets, busyTicketId, onOpen, onRestore }: Props) {
  if (tickets.length === 0) {
    return (
      <Card padding="lg" radius="md" style={{ background: 'var(--ps-card-bg)' }}>
        <Stack gap={6} align="center">
          <IconInfoCircle size={20} opacity={0.5} />
          <Text size="sm" fw={600}>
            Nothing archived
          </Text>
          {/* An empty archive is not an error and not a task, so it says what the
              place is for rather than prompting anyone to fill it. */}
          <Text size="xs" c="dimmed" ta="center" maw={420}>
            Archiving takes a ticket off the board and keeps its file, so finished or abandoned work
            stays searchable without crowding the columns.
          </Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {tickets.length} archived {tickets.length === 1 ? 'ticket' : 'tickets'}. These are not on
        the board and are never suggested as the next ticket. Nothing here has been deleted.
      </Text>

      {tickets.map((ticket) => (
        <Card
          key={ticket.id}
          padding="sm"
          radius="md"
          opacity={busyTicketId === ticket.id ? 0.55 : 1}
          onClick={(event) => {
            // The row opens the ticket; the Restore button inside it does not.
            if ((event.target as HTMLElement).closest('button')) return
            if (busyTicketId !== ticket.id) onOpen(ticket.id)
          }}
          style={{
            background: 'var(--ps-card-bg-quiet)',
            border: '1px solid var(--ps-hairline)',
            cursor: busyTicketId === ticket.id ? 'progress' : 'pointer',
          }}
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={500} style={{ lineHeight: 1.4 }}>
                {ticket.title}
              </Text>
              <Group gap="xs">
                {/* The status it kept. Archiving is not a status, so this is the
                    real one and the one restoring puts it back to. */}
                <Badge size="xs" variant="light" color={STATUS_COLOR[ticket.status]}>
                  {STATUS_LABEL[ticket.status]}
                </Badge>
                <Text size="xs" c="dimmed">
                  Archived {archivedOn(ticket.archivedAt ?? '')}
                </Text>
              </Group>
            </Stack>

            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconArchiveOff size={14} />}
              disabled={busyTicketId === ticket.id}
              onClick={() => onRestore(ticket.id)}
            >
              Restore
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  )
}
