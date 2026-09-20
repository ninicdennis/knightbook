import { Box, Button, Group, Stack, Text } from '@mantine/core'
import { DragDropProvider, useDraggable } from '@dnd-kit/react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import type { MovableStatus, ProjectView, TicketStatus, TicketView } from '../../shared/contract.js'
import { orderDone } from '../done-order.js'
import { BoardColumn, EmptyColumn } from './BoardColumn.js'
import { RecordProblems } from './RecordProblems.js'
import { TicketCard } from './TicketCard.js'

/**
 * The board. Dragging is one way to move a card; every card also carries a menu
 * with the same moves, because drag-and-drop alone is not reachable by keyboard.
 *
 * Done is a column you can drop into, but it is not an ordinary status change:
 * it records the user's completion decision, so it routes through a different
 * callback that asks first. It is also the only column shown collapsed, because
 * it is the only one that grows without bound.
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
  const [doneExpanded, setDoneExpanded] = useState(false)

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

  const card = (ticket: TicketView) => (
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
  )

  return (
    <Stack gap="sm" style={{ height: '100%' }}>
      <RecordProblems problems={project.problems} />
      <DragDropProvider onDragEnd={handleDragEnd}>
        <Group align="stretch" gap="md" wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
          {COLUMNS.map((status) => {
            const tickets = project.tickets.filter((ticket) => ticket.status === status)
            const listing = status === 'done' ? orderDone(tickets, doneExpanded) : null

            return (
              <BoardColumn
                key={status}
                status={status}
                // The total always shows, whether or not every card is on screen.
                count={tickets.length}
                quiet={status === 'done'}
              >
                {tickets.length === 0 ? (
                  <EmptyColumn status={status} project={project} />
                ) : listing ? (
                  <>
                    {listing.visible.map(card)}
                    <DoneToggle
                      total={tickets.length}
                      hiddenCount={listing.hiddenCount}
                      hiddenUnattributed={listing.hiddenUnattributed}
                      expanded={doneExpanded}
                      onToggle={() => setDoneExpanded((open) => !open)}
                    />
                  </>
                ) : (
                  tickets.map(card)
                )}
              </BoardColumn>
            )
          })}
        </Group>
      </DragDropProvider>
    </Stack>
  )
}

/**
 * Reveals the rest of Done. Cards hidden with no recorded completion decision are
 * counted here: that state must never be quietly absent from the board (D-005).
 */
function DoneToggle({
  total,
  hiddenCount,
  hiddenUnattributed,
  expanded,
  onToggle,
}: {
  total: number
  hiddenCount: number
  hiddenUnattributed: number
  expanded: boolean
  onToggle: () => void
}) {
  if (!expanded && hiddenCount === 0) return null

  return (
    <Stack gap={2} mt={2}>
      <Button
        variant="subtle"
        color="gray"
        size="compact-xs"
        justify="flex-start"
        leftSection={expanded ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
        onClick={onToggle}
      >
        {expanded ? 'Show fewer' : `Show all ${total}`}
      </Button>
      {!expanded && hiddenUnattributed > 0 && (
        <Text size="xs" c="dimmed" pl={6}>
          {hiddenUnattributed === 1
            ? '1 hidden card has no recorded decision.'
            : `${hiddenUnattributed} hidden cards have no recorded decision.`}
        </Text>
      )}
    </Stack>
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
