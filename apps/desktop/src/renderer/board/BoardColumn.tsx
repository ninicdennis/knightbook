import {
  ActionIcon,
  Box,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { IconArchive, IconDotsVertical, IconPlus } from '@tabler/icons-react'
import { useDroppable } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import type { ProjectView, TicketStatus } from '../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme/theme.js'

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
  /** Opens the confirmation for archiving this column. Null hides the menu. */
  onArchiveColumn: (() => void) | null
  /** Opens the new-ticket form. Only Backlog has one: new tickets always start there. */
  onNewTicket?: () => void
  /** The column's own filter button, drawn in the heading. */
  filterControl?: ReactNode
  /** Says what the column's filter hides, above the list. */
  filterNotice?: ReactNode
  children: ReactNode
}

export function BoardColumn({
  status,
  count,
  quiet = false,
  onArchiveColumn,
  onNewTicket,
  filterControl,
  filterNotice,
  children,
}: ColumnProps) {
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
        <Group gap={4} wrap="nowrap">
          {onNewTicket && (
            <Tooltip label="New ticket" withinPortal>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`New ticket in ${STATUS_LABEL[status]}`}
                onClick={onNewTicket}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {filterControl}
          <Text size="sm" c="dimmed" fw={500} aria-label={`${count} in ${STATUS_LABEL[status]}`}>
            {count}
          </Text>
          {/* Offered even when the column is empty would be a dead control, so
              the menu appears only when there is something it could act on. */}
          {onArchiveColumn && count > 0 && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <UnstyledButton
                  aria-label={`Actions for the ${STATUS_LABEL[status]} column`}
                  style={{ lineHeight: 1 }}
                >
                  <IconDotsVertical size={14} opacity={0.5} />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconArchive size={14} />}
                  onClick={onArchiveColumn}
                  color="orange"
                >
                  Archive all in this column…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      {filterNotice && <Box mb="xs">{filterNotice}</Box>}

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
