import { Badge, Button, Group, Stack, Text } from '@mantine/core'
import { IconFileText, IconMap } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { TicketDetailView, TicketPlanView, TicketView } from '../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'

/**
 * The secondary sections of the ticket detail: what it depends on, which
 * documents it points at, who accepted it, and when it was written.
 *
 * They live beside the dialog shell rather than inside it so the shell stays
 * about layout — a header, one scrolling reading area, and an action bar — and
 * each section can grow without pushing the dialog over a readable size.
 */

/** A labelled group inside the reading area, quieter than the Markdown headings. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

export function Dependencies({ ticket, detail }: { ticket: TicketView; detail: TicketDetailView }) {
  if (detail.dependencies.length === 0) return null

  const cannotStart = ticket.status === 'backlog' && !ticket.dependencyReady
  // D-017 takes precedence over D-014: a prerequisite that reached Verification
  // and then failed it must not still read as satisfying anything.
  const failed = new Set(ticket.affectedBy.map((entry) => entry.ticketId))

  return (
    <Section title="Depends on">
      {detail.dependencies.map((dependency) => (
        <Group key={dependency.id} gap="xs" wrap="wrap" align="baseline">
          <Badge
            size="xs"
            variant="light"
            color={dependency.status ? STATUS_COLOR[dependency.status] : 'red'}
          >
            {dependency.status
              ? STATUS_LABEL[dependency.status]
              : dependency.unreadable
                ? 'Unreadable'
                : 'Missing'}
          </Badge>
          <Text size="sm">
            {dependency.title ??
              (dependency.unreadable
                ? `Ticket ${dependency.id} could not be read`
                : `No ticket with id ${dependency.id}`)}
          </Text>
          <Text size="xs" {...(failed.has(dependency.id) ? { c: 'orange' } : { c: 'dimmed' })}>
            {dependency.status === null
              ? dependency.unreadable
                ? 'its file could not be read, so this cannot be checked'
                : 'is missing from this project'
              : failed.has(dependency.id)
                ? 'failed verification, so it does not unlock this'
                : dependency.satisfied
                  ? 'satisfies this dependency'
                  : 'is not ready yet'}
          </Text>
        </Group>
      ))}
      <Text size="xs" c="dimmed">
        A prerequisite in Verification or Done lets this ticket start. That does not mean it has
        been accepted.
      </Text>
      {cannotStart && ticket.dependencyNotes.length > 0 && (
        <Text size="xs" c="orange">
          {ticket.dependencyNotes.join('; ')}
        </Text>
      )}
    </Section>
  )
}

/**
 * One path per line, each wrapping in place. A project-relative path can be
 * longer than the dialog, and a link that widens the dialog would put the
 * reading text off the side of the window.
 */
export function RelatedDocuments({
  paths,
  onOpen,
}: {
  paths: string[]
  onOpen: (path: string) => void
}) {
  if (paths.length === 0) return null

  return (
    <Section title="Related documents">
      <Stack gap={2} align="flex-start" style={{ maxWidth: '100%' }}>
        {paths.map((path) => (
          <Button
            key={path}
            variant="subtle"
            size="compact-sm"
            leftSection={<IconFileText size={14} />}
            onClick={() => onOpen(path)}
            style={{ maxWidth: '100%', height: 'auto', paddingBlock: 4 }}
            styles={{
              inner: { alignItems: 'flex-start' },
              /*
               * `anywhere` rather than `break-word`: only the former lets the
               * path count as narrow when the dialog measures its contents, so
               * a long one wraps instead of making the dialog wider.
               */
              label: { whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' },
            }}
          >
            {path}
          </Button>
        ))}
      </Stack>
    </Section>
  )
}

/**
 * The plan phases this ticket is part of. Membership is read from the plans, so
 * nothing here is written on the ticket itself; opening one shows the plan.
 */
export function PlanMemberships({
  plans,
  onOpen,
}: {
  plans: TicketPlanView[]
  onOpen: (planId: string) => void
}) {
  if (plans.length === 0) return null

  return (
    <Section title="Plans">
      <Stack gap={2} align="flex-start" style={{ maxWidth: '100%' }}>
        {plans.map((membership) => (
          <Button
            key={`${membership.planId}:${membership.phaseId}`}
            variant="subtle"
            size="compact-sm"
            leftSection={<IconMap size={14} />}
            onClick={() => onOpen(membership.planId)}
            style={{ maxWidth: '100%', height: 'auto', paddingBlock: 4 }}
            styles={{
              label: { whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' },
            }}
          >
            {membership.planTitle} · {membership.phaseTitle}
          </Button>
        ))}
      </Stack>
    </Section>
  )
}

/**
 * When the record was written and which revision is on screen. Shown as labelled
 * rows rather than one run-on line: the revision is what a conflict message
 * names, so it has to be readable in full rather than abbreviated away.
 */
export function AuditDetails({
  detail,
  lastReviewedAt,
}: {
  detail: TicketDetailView
  lastReviewedAt: string | null
}) {
  return (
    <Section title="Record details">
      <Stack gap={2}>
        <DetailRow label="Created" value={formatWhen(detail.createdAt)} />
        <DetailRow label="Updated" value={formatWhen(detail.updatedAt)} />
        {lastReviewedAt && <DetailRow label="Last reviewed" value={formatWhen(lastReviewedAt)} />}
        <DetailRow label="Revision" value={detail.revision} />
      </Stack>
    </Section>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Text size="xs" c="dimmed" style={{ flex: '0 0 6.5rem' }}>
        {label}
      </Text>
      <Text size="xs" style={{ minWidth: 0, wordBreak: 'break-word' }}>
        {value}
      </Text>
    </Group>
  )
}

export function CompletionRecord({
  completion,
}: {
  completion: NonNullable<TicketView['completion']>
}) {
  const byAgent = completion.recordedBy === 'agent'

  return (
    <Section title="Completion record">
      <Text size="sm">
        {byAgent ? 'Recorded by an AI tool on your instruction' : 'Accepted by you in the app'} ·{' '}
        {formatWhen(completion.recordedAt)}
      </Text>
      <Text size="sm" c="dimmed">
        &ldquo;{completion.instruction}&rdquo;
      </Text>
      {byAgent && (
        <Text size="xs" c="dimmed">
          You told the AI this was complete and it recorded your decision; it did not decide this
          itself.
        </Text>
      )}
    </Section>
  )
}

/**
 * Acceptances that were taken back. Kept separate from the completion record
 * and worded in the past, so nothing here can be read as the ticket's current
 * standing — this is what happened, not where the work is.
 */
export function ReopenedRecord({
  previous,
}: {
  previous: TicketDetailView['previousCompletions']
}) {
  // Absent rather than empty means a host that predates this field. There is no
  // history to show either way, and a missing list must not blank the dialog.
  if (!previous || previous.length === 0) return null

  return (
    <Section title={previous.length === 1 ? 'Reopened after acceptance' : 'Reopened twice or more'}>
      <Stack gap="xs">
        {previous.map((entry) => (
          <Stack key={entry.reopenedAt} gap={0}>
            <Text size="sm">
              {entry.recordedBy === 'agent'
                ? 'Recorded by an AI tool on your instruction'
                : 'Accepted by you in the app'}{' '}
              · {formatWhen(entry.recordedAt)}
            </Text>
            <Text size="sm" c="dimmed">
              &ldquo;{entry.instruction}&rdquo;
            </Text>
            <Text size="xs" c="dimmed">
              Moved to {STATUS_LABEL[entry.reopenedTo]} on {formatWhen(entry.reopenedAt)}, which
              took that acceptance back.
            </Text>
          </Stack>
        ))}
      </Stack>
    </Section>
  )
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}
