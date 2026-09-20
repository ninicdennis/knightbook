import { Badge, Card, Group, Menu, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowBarToUp,
  IconArrowDown,
  IconArrowUp,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconInfoCircle,
  IconLock,
  IconThumbDown,
  IconUserCheck,
  IconRobot,
  IconRotateClockwise,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { MovableStatus, TicketView } from '../../shared/contract.js'
import { STATUS_LABEL } from '../theme.js'

/**
 * A card carries the things the specification says must never be implied: why a
 * ticket cannot start, that a completion was recorded without an attributable
 * decision, and who recorded the decision that does exist.
 *
 * The title is what a person scans, so it is read first and given room. Every
 * status badge sits in one footer row underneath instead of stacking between the
 * title and the next card, which kept moving the titles out of line.
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
}: Props) {
  const blockedInBacklog = ticket.status === 'backlog' && !ticket.dependencyReady
  const isDone = ticket.status === 'done'
  const affected = ticket.affectedBy.length > 0

  // An empty footer row would still take space and pull the titles out of line.
  const hasFooter =
    isNext ||
    ticket.review.state !== 'reviewed' ||
    blockedInBacklog ||
    ticket.blocker !== null ||
    ticket.verificationIssue !== null ||
    affected ||
    ticket.completionUnattributed ||
    ticket.completion !== null

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
            </Menu.Dropdown>
          </Menu>
        </Group>

        {hasFooter && (
          <StatusFooter>
            {isNext && (
              <Badge size="sm" variant="filled" color="accent">
                Next up
              </Badge>
            )}

            {/*
            Review is informational and never blocks work (D-004), so it reads as a
            quiet note rather than a warning. What it must not do is let unreviewed
            content look reviewed, so "unreviewed" is shown rather than left blank.
          */}
            {ticket.review.state === 'unreviewed' && (
              <QuietBadge
                icon={<IconEyeOff size={11} />}
                label="Unreviewed"
                tooltip="No one has confirmed this content yet. Work can still proceed; this only tracks whether a person has read it."
              />
            )}

            {ticket.review.state === 'changed_since_review' && (
              <Tooltip
                multiline
                w={300}
                withArrow
                label={ticket.review.changeSummary ?? 'The content changed after it was reviewed.'}
              >
                <Badge size="sm" variant="light" color="yellow" leftSection={<IconEye size={11} />}>
                  Changed since review
                </Badge>
              </Tooltip>
            )}

            {blockedInBacklog && (
              <QuietBadge
                icon={<IconLock size={11} />}
                label={`Waiting on ${ticket.dependsOn.length}`}
                tooltip={ticket.dependencyNotes.join('; ') || 'Not ready to start.'}
              />
            )}

            {ticket.blocker && (
              <Tooltip multiline w={300} withArrow label={ticket.blocker}>
                <Badge
                  size="sm"
                  variant="light"
                  color="orange"
                  leftSection={<IconAlertTriangle size={11} />}
                >
                  Blocked
                </Badge>
              </Tooltip>
            )}

            {/*
            D-017. Two different facts, never merged into one badge: this ticket
            failed verification, or this ticket's work rests on one that did.
          */}
            {ticket.verificationIssue && (
              <Tooltip
                multiline
                w={320}
                withArrow
                label={`${ticket.verificationIssue.reason} — recorded ${
                  ticket.verificationIssue.recordedBy === 'agent'
                    ? 'by the AI from what you told it'
                    : 'by you in the app'
                }. Nothing was moved or reset.`}
              >
                <Badge
                  size="sm"
                  variant="light"
                  color="orange"
                  leftSection={<IconThumbDown size={11} />}
                >
                  Failed verification
                </Badge>
              </Tooltip>
            )}

            {affected && (
              <Tooltip
                multiline
                w={320}
                withArrow
                label={ticket.affectedBy
                  .map(
                    (failed) =>
                      `${failed.title}${failed.direct ? '' : ' (further up the chain)'}: ${failed.issue}`,
                  )
                  .join('\n')}
              >
                <Badge
                  size="sm"
                  variant="light"
                  color="orange"
                  leftSection={<IconAlertTriangle size={11} />}
                >
                  {ticket.affectedBy.length === 1
                    ? 'Affected by a failure'
                    : `Affected by ${ticket.affectedBy.length} failures`}
                </Badge>
              </Tooltip>
            )}

            {ticket.completionUnattributed && (
              <Tooltip
                multiline
                w={280}
                withArrow
                label="This was set to Done outside the app, with no recorded decision. Nothing here shows who accepted it."
              >
                <Badge
                  size="sm"
                  variant="light"
                  color="orange"
                  leftSection={<IconAlertTriangle size={11} />}
                >
                  Unattributed
                </Badge>
              </Tooltip>
            )}

            {ticket.completion && (
              <Tooltip
                multiline
                w={300}
                withArrow
                label={
                  ticket.completion.recordedBy === 'agent'
                    ? `You told the AI this was complete and it recorded your decision; it did not decide this itself. Recorded as: "${ticket.completion.instruction}"`
                    : ticket.completion.instruction
                }
              >
                <Badge
                  size="sm"
                  variant="light"
                  color="teal"
                  leftSection={
                    ticket.completion.recordedBy === 'agent' ? (
                      <IconRobot size={11} />
                    ) : (
                      <IconUserCheck size={11} />
                    )
                  }
                >
                  {ticket.completion.recordedBy === 'agent' ? 'Recorded by AI' : 'Accepted by you'}
                </Badge>
              </Tooltip>
            )}
          </StatusFooter>
        )}
      </Stack>
    </Card>
  )
}

/** One row for every badge on the card, wrapping rather than pushing the title. */
function StatusFooter({ children }: { children: ReactNode }) {
  return (
    <Group gap={6} wrap="wrap" style={{ rowGap: 4 }}>
      {children}
    </Group>
  )
}

/**
 * Secondary metadata: present and readable, but not competing with the title or
 * with the states that mean something is wrong.
 */
function QuietBadge({ icon, label, tooltip }: { icon: ReactNode; label: string; tooltip: string }) {
  return (
    <Tooltip multiline w={280} withArrow label={tooltip}>
      <Badge size="sm" variant="default" leftSection={icon}>
        {label}
      </Badge>
    </Tooltip>
  )
}
