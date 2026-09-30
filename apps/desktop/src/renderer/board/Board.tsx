import { Box, Button, Group, Stack, Text } from '@mantine/core'
import { DragDropProvider, useDraggable } from '@dnd-kit/react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import type { MovableStatus, ProjectView, TicketStatus, TicketView } from '../../shared/contract.js'
import { orderDone } from './done-order.js'
import { BoardColumn, EmptyColumn } from './BoardColumn.js'
import { PlanFilterBar } from './PlanFilterBar.js'
import { usePlanFilter } from './usePlanFilter.js'
import { ColumnFilterButton } from './column-filter/ColumnFilterButton.js'
import { ColumnFilterNotice } from './column-filter/ColumnFilterNotice.js'
import { isFiltered, ticketMatchesColumnFilter } from './column-filter/column-filter.js'
import { useColumnFilters } from './column-filter/useColumnFilters.js'
import type { BacklogMove } from './column-filter/backlog-move.js'
import { BacklogOrderProblems } from './BacklogOrderProblems.js'
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
  /**
   * Manual backlog order, which is what "next up" follows. `visible` is the
   * backlog as drawn, so a move in a filtered column passes a visible card.
   */
  onReorder: (ticketId: string, to: BacklogMove, visible: readonly string[]) => void
  /** D-017: the user says this did not pass verification, and why. */
  onReportIssue: (ticketId: string) => void
  onResolveIssue: (ticketId: string) => void
  onReview: (ticketId: string) => void
  onOpen: (ticketId: string) => void
  onArchive: (ticketId: string) => void
  /** Opens the confirmation for archiving every ticket in one column. */
  onArchiveColumn: (status: TicketStatus) => void
  onNewTicket: () => void
}

export function Board({
  project,
  busyTicketId,
  onMove,
  onComplete,
  onReorder,
  onReportIssue,
  onResolveIssue,
  onReview,
  onOpen,
  onArchive,
  onArchiveColumn,
  onNewTicket,
}: BoardProps) {
  const [doneExpanded, setDoneExpanded] = useState(false)
  // D-035: narrows what is drawn, never what is stored or what "next up" means.
  const plan = usePlanFilter(project.checkoutPath, project.plans)
  const filtered = plan.filter.kind !== 'all'
  const shown = project.tickets.filter((ticket) => plan.matches(ticket.id))
  // Each column's own filter narrows further, and only that column.
  const columns = useColumnFilters(project.checkoutPath)
  const drawn = (status: TicketStatus) =>
    shown.filter(
      (ticket) =>
        ticket.status === status && ticketMatchesColumnFilter(ticket, columns.filters[status]),
    )
  const visibleBacklogIds = drawn('backlog').map((ticket) => ticket.id)

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

  /**
   * Manual order is a backlog concept: it is the queue "next up" reads. Cards in
   * the other columns are ordered by what has happened to them, not by a list
   * anyone arranges, so they carry no reorder actions.
   */
  const backlogIds = project.tickets
    .filter((candidate) => candidate.status === 'backlog')
    .map((candidate) => candidate.id)

  const card = (ticket: TicketView) => (
    <DraggableTicket key={ticket.id} id={ticket.id} disabled={busyTicketId !== null}>
      <TicketCard
        ticket={ticket}
        isNext={project.nextTicketId === ticket.id}
        busy={busyTicketId === ticket.id}
        onReorder={
          ticket.status === 'backlog' ? (to) => onReorder(ticket.id, to, visibleBacklogIds) : null
        }
        atTop={backlogIds[0] === ticket.id}
        atBottom={backlogIds[backlogIds.length - 1] === ticket.id}
        onMove={(next) => onMove(ticket.id, next)}
        onComplete={() => onComplete(ticket.id)}
        onReportIssue={() => onReportIssue(ticket.id)}
        onResolveIssue={() => onResolveIssue(ticket.id)}
        onReview={() => onReview(ticket.id)}
        onOpen={() => onOpen(ticket.id)}
        onArchive={() => onArchive(ticket.id)}
      />
    </DraggableTicket>
  )

  /**
   * What a column lists. A column the plan filter empties and one whose own
   * filter matches nothing each say which filter is responsible (the latter in
   * its notice), so neither passes for a column with no tickets.
   */
  const columnBody = (
    status: TicketStatus,
    inColumn: number,
    inPlan: number,
    tickets: TicketView[],
  ) => {
    if (inPlan === 0 && inColumn > 0) {
      return (
        <Text size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>
          {inColumn === 1
            ? '1 ticket here is hidden by the plan filter.'
            : `${inColumn} tickets here are hidden by the plan filter.`}
        </Text>
      )
    }
    if (inPlan === 0) return <EmptyColumn status={status} project={project} />
    if (tickets.length === 0) return null
    if (status !== 'done') return tickets.map(card)

    const listing = orderDone(tickets, doneExpanded)
    return (
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
    )
  }

  return (
    <Stack gap="sm" style={{ height: '100%' }}>
      <RecordProblems problems={project.problems} />
      <BacklogOrderProblems problems={project.backlogOrderProblems} />
      <PlanFilterBar
        plans={project.plans}
        filter={plan.filter}
        onChange={plan.setFilter}
        matching={shown.length}
        total={project.tickets.length}
      />
      <DragDropProvider onDragEnd={handleDragEnd}>
        <Group align="stretch" gap="md" wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
          {COLUMNS.map((status) => {
            const inColumn = project.tickets.filter((ticket) => ticket.status === status)
            const inPlan = shown.filter((ticket) => ticket.status === status)
            const tickets = drawn(status)
            const columnFilter = columns.filters[status]
            const columnFiltered = isFiltered(columnFilter)

            return (
              <BoardColumn
                key={status}
                status={status}
                // The total always shows, whether or not every card is on screen.
                // Filtered, it is the matching total; the plan bar or the
                // column's own notice says so.
                count={tickets.length}
                quiet={status === 'done'}
                // Archiving a whole column would include cards the filter hides,
                // so it is offered on the unfiltered board only.
                onArchiveColumn={filtered || columnFiltered ? null : () => onArchiveColumn(status)}
                {...(status === 'backlog' ? { onNewTicket } : {})}
                filterControl={
                  <ColumnFilterButton
                    status={status}
                    filter={columnFilter}
                    onChange={(next) => columns.setColumnFilter(status, next)}
                  />
                }
                filterNotice={
                  columnFiltered && inPlan.length > 0 ? (
                    <ColumnFilterNotice
                      shown={tickets.length}
                      total={inPlan.length}
                      onClear={() => columns.clearColumnFilter(status)}
                    />
                  ) : null
                }
              >
                {columnBody(status, inColumn.length, inPlan.length, tickets)}
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
