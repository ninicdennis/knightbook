import { Badge, Card, Group, Menu, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconLock,
  IconUserCheck,
  IconRobot,
} from '@tabler/icons-react'
import type { MovableStatus, TicketView } from '../../shared/contract.js'
import { STATUS_LABEL } from '../theme.js'

/**
 * A card carries the things the specification says must never be implied: why a
 * ticket cannot start, that a completion was recorded without an attributable
 * decision, and who recorded the decision that does exist.
 */

const MOVABLE: MovableStatus[] = ['backlog', 'in_progress', 'verification']

interface Props {
  ticket: TicketView
  isNext: boolean
  busy: boolean
  onMove: (status: MovableStatus) => void
  onComplete: () => void
  onReview: () => void
}

export function TicketCard({ ticket, isNext, busy, onMove, onComplete, onReview }: Props) {
  const blockedInBacklog = ticket.status === 'backlog' && !ticket.dependencyReady

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      opacity={busy ? 0.55 : 1}
      style={{
        borderColor: isNext ? 'var(--mantine-color-accent-filled)' : undefined,
        cursor: busy ? 'progress' : 'grab',
      }}
    >
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text size="sm" fw={500} style={{ lineHeight: 1.35 }}>
            {ticket.title}
          </Text>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <UnstyledButton aria-label={`Move ${ticket.title}`} disabled={busy}>
                <IconDotsVertical size={16} opacity={0.6} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
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
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>

        {isNext && (
          <Badge size="xs" variant="light" color="accent">
            Next up
          </Badge>
        )}

        {/*
          Review is informational and never blocks work (D-004), so it reads as a
          quiet note rather than a warning. What it must not do is let unreviewed
          content look reviewed, so "unreviewed" is shown rather than left blank.
        */}
        {ticket.review.state === 'unreviewed' && (
          <Tooltip
            multiline
            w={280}
            withArrow
            label="No one has confirmed this content yet. Work can still proceed; this only tracks whether a person has read it."
          >
            <Badge
              size="xs"
              variant="outline"
              color="gray"
              leftSection={<IconEyeOff size={11} />}
              style={{ alignSelf: 'flex-start' }}
            >
              Unreviewed
            </Badge>
          </Tooltip>
        )}

        {ticket.review.state === 'changed_since_review' && (
          <Tooltip
            multiline
            w={300}
            withArrow
            label={ticket.review.changeSummary ?? 'The content changed after it was reviewed.'}
          >
            <Badge
              size="xs"
              variant="light"
              color="yellow"
              leftSection={<IconEye size={11} />}
              style={{ alignSelf: 'flex-start' }}
            >
              Changed since review
            </Badge>
          </Tooltip>
        )}

        {blockedInBacklog && (
          <Tooltip
            multiline
            w={280}
            withArrow
            label={ticket.dependencyNotes.join('; ') || 'Not ready to start.'}
          >
            <Badge
              size="xs"
              variant="light"
              color="gray"
              leftSection={<IconLock size={11} />}
              style={{ alignSelf: 'flex-start' }}
            >
              Waiting on {ticket.dependsOn.length}
            </Badge>
          </Tooltip>
        )}

        {ticket.blocker && (
          <Badge
            size="xs"
            variant="light"
            color="orange"
            leftSection={<IconAlertTriangle size={11} />}
            style={{ alignSelf: 'flex-start' }}
          >
            Blocked
          </Badge>
        )}

        {ticket.completionUnattributed && (
          <Tooltip
            multiline
            w={280}
            withArrow
            label="This was set to Done outside the app, with no recorded decision. Nothing here shows who accepted it."
          >
            <Badge
              size="xs"
              variant="light"
              color="orange"
              leftSection={<IconAlertTriangle size={11} />}
              style={{ alignSelf: 'flex-start' }}
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
              size="xs"
              variant="light"
              color="teal"
              leftSection={
                ticket.completion.recordedBy === 'agent' ? (
                  <IconRobot size={11} />
                ) : (
                  <IconUserCheck size={11} />
                )
              }
              style={{ alignSelf: 'flex-start' }}
            >
              {ticket.completion.recordedBy === 'agent' ? 'Recorded by AI' : 'Accepted by you'}
            </Badge>
          </Tooltip>
        )}
      </Stack>
    </Card>
  )
}
