import { Badge, Group, Tooltip } from '@mantine/core'
import {
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconLock,
  IconRobot,
  IconThumbDown,
  IconUserCheck,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { TicketView } from '../../shared/contract.js'
import { TicketTypeBadge } from './TicketTypeBadge.js'

/**
 * Everything a card says underneath its title, in one wrapping row.
 *
 * The order is the order of importance, and it is deliberate. What kind of work
 * this is comes first and quietest, because it describes the ticket rather than
 * its state. "Next up" is the strongest thing on the board. Then the states that
 * mean something is wrong or unfinished. Nothing here is allowed to compete with
 * the title above it, and nothing is conveyed by colour alone.
 *
 * An empty row would still take space and pull the titles out of line, so when
 * there is nothing to say this renders nothing at all.
 */

interface Props {
  ticket: TicketView
  isNext: boolean
}

export function TicketCardBadges({ ticket, isNext }: Props) {
  const blockedInBacklog = ticket.status === 'backlog' && !ticket.dependencyReady
  const affected = ticket.affectedBy.length > 0

  const hasAnything =
    ticket.type !== null ||
    isNext ||
    ticket.review.state !== 'reviewed' ||
    blockedInBacklog ||
    ticket.blocker !== null ||
    ticket.verificationIssue !== null ||
    affected ||
    ticket.completionUnattributed ||
    ticket.completion !== null

  if (!hasAnything) return null

  return (
    <Group gap={6} wrap="wrap" style={{ rowGap: 4 }}>
      <TicketTypeBadge type={ticket.type} />

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
          <Badge size="sm" variant="light" color="orange" leftSection={<IconThumbDown size={11} />}>
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
