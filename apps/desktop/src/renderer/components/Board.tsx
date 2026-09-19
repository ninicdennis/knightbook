import { Badge, Box, Card, Group, ScrollArea, Stack, Text } from '@mantine/core'
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import type { MovableStatus, ProjectView, TicketStatus } from '../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'
import { TicketCard } from './TicketCard.js'

/**
 * The board. Dragging is one way to move a card; every card also carries a menu
 * with the same moves, because drag-and-drop alone is not reachable by keyboard.
 *
 * Done is a column you can drop into, but it is not an ordinary status change:
 * it records the user's completion decision, so it routes through a different
 * callback that asks first.
 */

const COLUMNS: TicketStatus[] = ['backlog', 'in_progress', 'verification', 'done']

interface BoardProps {
  project: ProjectView
  busyTicketId: string | null
  onMove: (ticketId: string, status: MovableStatus) => void
  onComplete: (ticketId: string) => void
  onReview: (ticketId: string) => void
  onOpen: (ticketId: string) => void
}

export function Board({ project, busyTicketId, onMove, onComplete, onReview, onOpen }: BoardProps) {
  const handleDragEnd = (event: { operation: { source: unknown; target: unknown } }) => {
    const source = event.operation.source as { id?: string } | null
    const target = event.operation.target as { id?: string } | null
    if (!source?.id || !target?.id) return

    const ticket = project.tickets.find((t) => t.id === source.id)
    const destination = target.id as TicketStatus
    if (!ticket || ticket.status === destination) return

    if (destination === 'done') onComplete(ticket.id)
    else onMove(ticket.id, destination as MovableStatus)
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <Group align="stretch" gap="md" wrap="nowrap" style={{ height: '100%' }}>
        {COLUMNS.map((status) => {
          const tickets = project.tickets.filter((ticket) => ticket.status === status)
          return (
            <Column key={status} status={status} count={tickets.length}>
              {tickets.length === 0 ? (
                <EmptyColumn status={status} project={project} />
              ) : (
                tickets.map((ticket) => (
                  <DraggableTicket key={ticket.id} id={ticket.id} disabled={busyTicketId !== null}>
                    <TicketCard
                      ticket={ticket}
                      isNext={project.nextTicketId === ticket.id}
                      busy={busyTicketId === ticket.id}
                      onMove={(next) => onMove(ticket.id, next)}
                      onComplete={() => onComplete(ticket.id)}
                      onReview={() => onReview(ticket.id)}
                      onOpen={() => onOpen(ticket.id)}
                    />
                  </DraggableTicket>
                ))
              )}
            </Column>
          )
        })}
      </Group>
    </DragDropProvider>
  )
}

function Column({
  status,
  count,
  children,
}: {
  status: TicketStatus
  count: number
  children: ReactNode
}) {
  const { ref, isDropTarget } = useDroppable({ id: status })

  return (
    <Card
      ref={ref}
      withBorder
      padding="sm"
      radius="md"
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDropTarget ? 'var(--mantine-color-default-hover)' : undefined,
        outline: isDropTarget ? '2px solid var(--mantine-color-accent-filled)' : 'none',
        outlineOffset: -2,
      }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>
          {STATUS_LABEL[status]}
        </Text>
        <Badge size="sm" variant="light" color={STATUS_COLOR[status]}>
          {count}
        </Badge>
      </Group>

      <ScrollArea.Autosize mah="calc(100vh - 230px)" type="hover">
        <Stack gap="xs" pr={4}>
          {children}
        </Stack>
      </ScrollArea.Autosize>
    </Card>
  )
}

function DraggableTicket({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: ReactNode
}) {
  const { ref, isDragging } = useDraggable({ id, disabled })

  return (
    <Box ref={ref} style={{ opacity: isDragging ? 0.4 : 1 }}>
      {children}
    </Box>
  )
}

/**
 * An empty column says why it is empty. The Backlog case is the one that matters:
 * "nothing eligible" and "nothing left" are different situations and must not
 * look the same.
 */
function EmptyColumn({ status, project }: { status: TicketStatus; project: ProjectView }) {
  if (status === 'backlog' && project.nextExplanation) {
    return (
      <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
        {project.nextExplanation}
      </Text>
    )
  }

  const message: Record<TicketStatus, string> = {
    backlog: 'Nothing waiting to start.',
    in_progress: 'Nothing being worked on.',
    verification: 'Nothing waiting for your check.',
    done: 'Nothing accepted yet.',
  }

  return (
    <Text size="xs" c="dimmed">
      {message[status]}
    </Text>
  )
}
