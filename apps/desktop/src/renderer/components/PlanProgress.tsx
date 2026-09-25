import { Group, Progress, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { TicketStatus } from '../../shared/contract.js'
import type { ProgressView } from '../../shared/plans-contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'

/**
 * Where a plan or phase stands. The bar is one segment per board state, so
 * Verification is visible on its own rather than folded into Done, and a
 * reference that could not be found takes a segment too: missing data must
 * never make the bar look fuller. Nothing planned reads as nothing planned.
 */

const ORDER: TicketStatus[] = ['done', 'verification', 'in_progress', 'backlog']

function describe(progress: ProgressView): string {
  const parts = [`${progress.byStatus.done} of ${progress.total} done`]
  for (const status of ['verification', 'in_progress', 'backlog'] as const) {
    const count = progress.byStatus[status]
    if (count > 0) parts.push(`${count} ${STATUS_LABEL[status].toLowerCase()}`)
  }
  const broken = progress.missing.length + progress.unreadable.length
  if (broken > 0) parts.push(`${broken} not found`)
  return parts.join(' · ')
}

export function PlanProgress({ progress, label }: { progress: ProgressView; label: string }) {
  if (progress.state === 'empty') {
    return (
      <Text size="xs" c="var(--ps-text-muted)">
        No tickets yet. Nothing is planned here, which is not the same as finished.
      </Text>
    )
  }

  const broken = progress.missing.length + progress.unreadable.length
  const share = (count: number) => (count / progress.total) * 100

  return (
    <Stack gap={4}>
      <Progress.Root size="sm" aria-label={`${label}: ${describe(progress)}`}>
        {ORDER.map((status) =>
          progress.byStatus[status] > 0 ? (
            <Progress.Section
              key={status}
              value={share(progress.byStatus[status])}
              color={STATUS_COLOR[status]}
            />
          ) : null,
        )}
        {broken > 0 && <Progress.Section value={share(broken)} color="red" striped />}
      </Progress.Root>
      <Text size="xs">
        {describe(progress)}
        {progress.state === 'complete' && ' — every linked ticket is accepted or recorded as done'}
      </Text>
      {progress.unattributedDone > 0 && (
        <Group gap={4} wrap="nowrap">
          <IconAlertTriangle size={12} color="var(--mantine-color-orange-6)" aria-hidden />
          <Text size="xs" c="orange">
            {progress.unattributedDone} counted as done with no recorded decision (unattributed).
          </Text>
        </Group>
      )}
    </Stack>
  )
}
