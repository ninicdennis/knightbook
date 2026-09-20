import { Box, Group, ScrollArea, Stack, Text } from '@mantine/core'
import { useDroppable } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import type { ProjectView, TicketStatus } from '../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'

/**
 * One column of the board: a drop target, a heading, and a scrolling list.
 *
 * It has no outline of its own. The window, the column, and the cards inside it
 * are told apart by their background shade (surfaces.css), which leaves an
 * outline free to mean "this is where the card will land".
 */

interface ColumnProps {
  status: TicketStatus
  count: number
  /** Done is not active work, so it is drawn a step further back. */
  quiet?: boolean
  children: ReactNode
}

export function BoardColumn({ status, count, quiet = false, children }: ColumnProps) {
  const { ref, isDropTarget } = useDroppable({ id: status })

  return (
    <Box
      ref={ref}
      p="sm"
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--mantine-radius-md)',
        background: isDropTarget
          ? 'var(--ps-column-bg-active)'
          : quiet
            ? 'var(--ps-column-bg-quiet)'
            : 'var(--ps-column-bg)',
        outline: isDropTarget ? '2px solid var(--mantine-color-accent-filled)' : 'none',
        outlineOffset: -2,
      }}
    >
      <Group justify="space-between" mb="sm" wrap="nowrap" px={2}>
        <Group gap={8} wrap="nowrap">
          <Box
            w={8}
            h={8}
            style={{
              borderRadius: '50%',
              flexShrink: 0,
              background: `var(--mantine-color-${STATUS_COLOR[status]}-filled)`,
              opacity: quiet ? 0.55 : 1,
            }}
          />
          <Text size="sm" fw={600} {...(quiet ? { c: 'dimmed' } : {})}>
            {STATUS_LABEL[status]}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" fw={500} aria-label={`${count} in ${STATUS_LABEL[status]}`}>
          {count}
        </Text>
      </Group>

      {/*
        The column is stretched to the row's height, so the list simply takes
        whatever is left under the heading. This used to subtract a guessed pixel
        count from the viewport, which silently went wrong as soon as anything
        else claimed vertical space: the status footer did exactly that.
      */}
      <ScrollArea type="hover" style={{ flex: 1, minHeight: 0 }}>
        <Stack gap="xs" pr={4}>
          {children}
        </Stack>
      </ScrollArea>
    </Box>
  )
}

/**
 * An empty column says what belongs there and how work reaches it, so the board
 * explains its own workflow without adding any controls to it.
 *
 * The Backlog case is the one that must stay precise: "nothing eligible" and
 * "nothing left" are different situations and must not look the same.
 */
export function EmptyColumn({ status, project }: { status: TicketStatus; project: ProjectView }) {
  if (status === 'backlog' && project.nextExplanation) {
    return (
      <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {project.nextExplanation}
      </Text>
    )
  }

  const message: Record<TicketStatus, string> = {
    backlog: 'Nothing waiting to start. New tickets arrive here.',
    in_progress: 'Nothing being worked on. Choose a Backlog ticket to begin.',
    verification: 'Empty. Finished work waits here until you accept it.',
    done: 'Nothing accepted yet. Only you can move work here.',
  }

  return (
    <Text size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>
      {message[status]}
    </Text>
  )
}
