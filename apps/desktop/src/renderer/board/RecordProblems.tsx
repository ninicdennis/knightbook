import { Alert, Button, Collapse, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { RecordProblemView } from '../../shared/contract.js'

/**
 * Record files the app could not use: a malformed ticket, an unresolved merge
 * conflict. The rest of the board still works, so this sits above it rather than
 * replacing it, and it never offers to repair anything. Technical design section
 * 3: preserve the bytes, say what is wrong, and stop writing to that record.
 */

export function RecordProblems({ problems }: { problems: RecordProblemView[] }) {
  const [open, list] = useDisclosure(false)
  if (problems.length === 0) return null

  const noun = problems.length === 1 ? 'record' : 'records'

  return (
    <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" py="xs">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm" fw={600}>
            {problems.length} {noun} could not be read, so{' '}
            {problems.length === 1 ? 'it is' : 'they are'} not on the board
          </Text>
          <Button size="compact-xs" variant="subtle" color="orange" onClick={list.toggle}>
            {open ? 'Hide files' : 'Show files'}
          </Button>
        </Group>

        <Collapse expanded={open}>
          <Stack gap="xs" mt={4}>
            <Text size="xs">
              Nothing was changed or rewritten, and these files cannot be edited from here until
              they are fixed. Resolve the problem in your editor (or finish the merge), then
              refresh.
            </Text>
            {problems.map((problem) => (
              <Stack key={problem.file} gap={0}>
                <Text size="xs" ff="monospace" fw={600} style={{ wordBreak: 'break-all' }}>
                  {problem.file}
                </Text>
                <Text size="xs">{problem.reason}</Text>
              </Stack>
            ))}
          </Stack>
        </Collapse>
      </Stack>
    </Alert>
  )
}
