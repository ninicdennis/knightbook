import { Box, Button, Group, Text } from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

/**
 * The open checkout, with its whole path. Two clones share a project id and
 * usually a name, so the path is what tells them apart (technical design
 * section 4). It is shown in full and wraps rather than truncating, because
 * here it is the thing being read, and it can be copied as it stands.
 *
 * This does not wait for the remembered-projects list, so the path is readable
 * even when that list cannot be.
 */

type CopyOutcome = 'copied' | 'failed'

export function CurrentProject({ name, path }: { name: string; path: string }) {
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null)

  useEffect(() => {
    if (outcome !== 'copied') return
    const timer = setTimeout(() => setOutcome(null), 2000)
    return () => clearTimeout(timer)
  }, [outcome])

  const copy = () => {
    navigator.clipboard.writeText(path).then(
      () => setOutcome('copied'),
      () => setOutcome('failed'),
    )
  }

  return (
    <Box
      p="sm"
      style={{
        border: '1px solid var(--ps-hairline)',
        borderRadius: 'var(--mantine-radius-sm)',
        background: 'var(--ps-column-bg)',
      }}
    >
      <Text size="xs" c="var(--ps-text-muted)" fw={500}>
        Open now
      </Text>
      <Text size="sm" fw={600} mt={2} style={{ wordBreak: 'break-word' }}>
        {name}
      </Text>
      <Text size="xs" mt={4} ff="monospace" style={{ wordBreak: 'break-all', userSelect: 'text' }}>
        {path}
      </Text>
      <Group gap="xs" mt="xs">
        <Button
          size="compact-xs"
          variant="default"
          leftSection={outcome === 'copied' ? <IconCheck size={14} /> : <IconCopy size={14} />}
          onClick={copy}
        >
          {outcome === 'copied' ? 'Copied' : 'Copy path'}
        </Button>
        {outcome === 'failed' && (
          <Text component="output" size="xs" c="orange">
            Could not copy to the clipboard. Select the path above instead.
          </Text>
        )}
      </Group>
    </Box>
  )
}
