import { Alert, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { ProjectView } from '../../shared/contract.js'

/**
 * Manual-order entries that do not make sense: a ticket listed twice, or an id
 * with no ticket behind it. Technical design section 5 requires these to be
 * reported and never deleted, so this says what is in the manifest and leaves it
 * there. An external edit, a hand-deleted ticket, or a Git merge can all produce
 * one, and quietly tidying it away would hide a real divergence.
 */

export function BacklogOrderProblems({
  problems,
}: {
  problems: ProjectView['backlogOrderProblems']
}) {
  const { duplicates, unknown } = problems
  if (duplicates.length === 0 && unknown.length === 0) return null

  return (
    <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" py="xs">
      <Stack gap={4}>
        <Text size="sm" fw={600}>
          The manual backlog order has entries that do not resolve
        </Text>
        {duplicates.length > 0 && (
          <Text size="xs">
            Listed more than once: {duplicates.join(', ')}. The first position is the one that
            counts.
          </Text>
        )}
        {unknown.length > 0 && (
          <Text size="xs">
            No ticket with this id: {unknown.join(', ')}. It is ignored when ordering the board.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Nothing was removed. Reordering from here keeps these entries, so edit{' '}
          <Text span ff="monospace" inherit>
            backlog_order
          </Text>{' '}
          in the project file if you want them gone.
        </Text>
      </Stack>
    </Alert>
  )
}
