import { Card, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import {
  IconArchive,
  IconArrowBarToUp,
  IconArrowDown,
  IconArrowUp,
  IconDotsVertical,
  IconEye,
  IconInfoCircle,
  IconThumbDown,
  IconUserCheck,
  IconRotateClockwise,
} from '@tabler/icons-react'
import type { MovableStatus, TicketView } from '../../shared/contract.js'
import { STATUS_LABEL } from '../theme/theme.js'
import { TicketCardBadges } from './TicketCardBadges.js'

/**
 * A card carries the things the specification says must never be implied: why a
 * ticket cannot start, that a completion was recorded without an attributable
 * decision, and who recorded the decision that does exist.
 *
 * The title is what a person scans, so it is read first and given room. Every
 * badge sits in one row underneath instead of stacking between the title and the
 * next card, which kept moving the titles out of line; that row is its own
 * component, because there are now nine things it can say.
 */

const MOVABLE: MovableStatus[] = ['backlog', 'in_progress', 'verification']

interface Props {
  ticket: TicketView
  isNext: boolean
  busy: boolean
  onMove: (status: MovableStatus) => void
  /** Manual backlog order. Null when this card is not in a reorderable place. */
  onReorder: ((to: 'top' | 'up' | 'down') => void) | null
  /** Which ends of the backlog this card is already at, so no dead menu items. */
  atTop: boolean
  atBottom: boolean
  onComplete: () => void
  /** D-017: the user says this did not pass verification, and why. */
  onReportIssue: () => void
  onResolveIssue: () => void
  onReview: () => void
  onOpen: () => void
  /** Takes this ticket off the board. Not a completion, and not a deletion. */
  onArchive: () => void
}

export function TicketCard({
  ticket,
  isNext,
  busy,
  onMove,
  onReorder,
  atTop,
  atBottom,
  onComplete,
  onReportIssue,
  onResolveIssue,
  onReview,
  onOpen,
  onArchive,
}: Props) {
  const isDone = ticket.status === 'done'

  return (
    <Card
      padding="sm"
      radius="md"
      opacity={busy ? 0.55 : 1}
      onClick={(event) => {
        // React bubbles clicks from the portalled menu up to this card, and the
        // menu button sits inside it. Only a click on the card itself opens it.
        const target = event.target as HTMLElement
        if (!event.currentTarget.contains(target) || target.closest('button')) return
        if (!busy) onOpen()
      }}
      style={{
        background: isDone ? 'var(--ps-card-bg-quiet)' : 'var(--ps-card-bg)',
        boxShadow: 'var(--ps-card-shadow)',
        cursor: busy ? 'progress' : 'pointer',
        /*
         * A border is a signal here, not decoration: the next ticket to pick up,
         * and work that cannot move. Everything else gets the hairline that only
         * separates the card from its column.
         */
        border: `1px solid ${
          isNext
            ? 'var(--mantine-color-accent-filled)'
            : ticket.blocker || ticket.verificationIssue
              ? 'var(--mantine-color-orange-filled)'
              : 'var(--ps-hairline)'
        }`,
        // The strongest accent on the board belongs to the work to pick up next.
        borderLeft: isNext ? '4px solid var(--mantine-color-accent-filled)' : undefined,
      }}
    >
      <Stack gap={10}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
          <Text
            size="sm"
            fw={isDone ? 500 : 600}
            style={{ lineHeight: 1.5, flex: 1, minWidth: 0 }}
            {...(isDone ? { c: 'dimmed' } : {})}
          >
            {ticket.title}
          </Text>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <UnstyledButton
                aria-label={`Actions for ${ticket.title}`}
                /* Where the detail dialog hands focus back to when it closes. */
                data-ticket-handle={ticket.id}
                disabled={busy}
                style={{ flexShrink: 0, lineHeight: 1 }}
              >
                <IconDotsVertical size={16} opacity={0.5} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconInfoCircle size={14} />} onClick={onOpen}>
                View details
              </Menu.Item>
              {onReorder && !(atTop && atBottom) && (
                <>
                  <Menu.Divider />
                  <Menu.Label>Order</Menu.Label>
                  {!atTop && (
                    <>
                      <Menu.Item
                        leftSection={<IconArrowBarToUp size={14} />}
                        onClick={() => onReorder('top')}
                      >
                        Move to top
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArrowUp size={14} />}
                        onClick={() => onReorder('up')}
                      >
                        Move up
                      </Menu.Item>
                    </>
                  )}
                  {!atBottom && (
                    <Menu.Item
                      leftSection={<IconArrowDown size={14} />}
                      onClick={() => onReorder('down')}
                    >
                      Move down
                    </Menu.Item>
                  )}
                </>
              )}
              <Menu.Divider />
              <Menu.Label>Move to</Menu.Label>
              {MOVABLE.filter((status) => status !== ticket.status).map((status) => (
                <Menu.Item key={status} onClick={() => onMove(status)}>
                  {STATUS_LABEL[status]}
                </Menu.Item>
              ))}
              {ticket.review.state !== 'reviewed' && (
                <>
                  <Menu.Divider />
                  <Menu.Item leftSection={<IconEye size={14} />} onClick={onReview}>
                    {ticket.review.state === 'changed_since_review'
                      ? 'Mark reviewed again'
                      : 'Mark content reviewed'}
                  </Menu.Item>
                </>
              )}
              {ticket.status === 'verification' && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconUserCheck size={14} />}
                    onClick={onComplete}
                    color="teal"
                  >
                    Accept as done
                  </Menu.Item>
                  {!ticket.verificationIssue && (
                    <Menu.Item
                      leftSection={<IconThumbDown size={14} />}
                      onClick={onReportIssue}
                      color="orange"
                    >
                      Did not pass verification…
                    </Menu.Item>
                  )}
                </>
              )}
              {ticket.verificationIssue && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconRotateClockwise size={14} />}
                    onClick={onResolveIssue}
                  >
                    Resolve the verification issue
                  </Menu.Item>
                </>
              )}
              {/* Last, and separated: archiving is housekeeping, not a step in
                  the work, and it should not sit among the moves. */}
              <Menu.Divider />
              <Menu.Item leftSection={<IconArchive size={14} />} onClick={onArchive}>
                Archive
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <TicketCardBadges ticket={ticket} isNext={isNext} />
      </Stack>
    </Card>
  )
}
