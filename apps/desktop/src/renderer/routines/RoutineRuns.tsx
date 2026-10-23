import { Badge, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import type { RoutineRunView, RoutineView } from '../../shared/routines-contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme/theme.js'

/**
 * A routine's runs, newest first, each opening its ticket. Completion is the
 * user's acceptance read from the ticket: a run in Verification says so, and a
 * Done ticket without a recorded decision is never shown as accepted.
 */

export function formatDay(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime())
    ? iso
    : when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function outcome(run: RoutineRunView): string {
  if (run.acceptedAt) return `Accepted ${formatDay(run.acceptedAt)}`
  if (run.completionUnattributed) return 'Done, with no recorded acceptance'
  return 'Not accepted yet'
}

function RunRow({ run, onOpen }: { run: RoutineRunView; onOpen: (id: string) => void }) {
  return (
    <li className="ps-plan-ticket">
      <UnstyledButton
        className="ps-plan-ticket-button"
        onClick={() => onOpen(run.ticketId)}
        aria-label={`Open the run started ${formatDay(run.startedAt)}, ${STATUS_LABEL[run.status]}`}
      >
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="sm">Started {formatDay(run.startedAt)}</Text>
          <Text size="xs" c={run.completionUnattributed ? 'orange' : 'var(--ps-text-muted)'}>
            {outcome(run)}
          </Text>
        </Stack>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {run.archived && (
            <Badge size="xs" variant="outline" color="gray">
              Archived
            </Badge>
          )}
          <Badge size="xs" variant="light" color={STATUS_COLOR[run.status]}>
            {STATUS_LABEL[run.status]}
          </Badge>
        </Group>
      </UnstyledButton>
    </li>
  )
}

export function RoutineRuns({
  routine,
  unreadableTickets,
  onOpen,
}: {
  routine: RoutineView
  unreadableTickets: number
  onOpen: (id: string) => void
}) {
  return (
    <section className="ps-plan-phase" aria-labelledby="routine-runs">
      <Title order={3} size="sm" id="routine-runs">
        Runs
      </Title>
      <Text size="sm" c="var(--ps-text-muted)">
        {routine.lastCompletedAt
          ? `Last accepted ${formatDay(routine.lastCompletedAt)}. ${routine.completedCount} of ${routine.runs.length} ${routine.runs.length === 1 ? 'run' : 'runs'} accepted.`
          : routine.runs.length === 0
            ? 'No runs yet.'
            : 'No run has been accepted yet.'}
      </Text>
      {unreadableTickets > 0 && (
        <Text size="xs" c="orange">
          {unreadableTickets === 1
            ? 'One ticket file could not be read, so a run may be missing here.'
            : `${unreadableTickets} ticket files could not be read, so runs may be missing here.`}
        </Text>
      )}
      {routine.runs.length > 0 && (
        <ul className="ps-plan-tickets">
          {routine.runs.map((run) => (
            <RunRow key={run.ticketId} run={run} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  )
}
