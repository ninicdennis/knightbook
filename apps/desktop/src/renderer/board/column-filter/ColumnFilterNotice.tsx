import { Button, Group, Text } from '@mantine/core'

/**
 * What a column filter is hiding, drawn at the top of the column while it is
 * filtered. Hidden cards must never look missing, so it says how many there are
 * and offers the one action that brings them back. When nothing matches it says
 * so in words that cannot be read as an empty column.
 */
export function ColumnFilterNotice({
  shown,
  total,
  onClear,
}: {
  shown: number
  total: number
  onClear: () => void
}) {
  const hidden = total - shown
  const message =
    shown === 0
      ? total === 1
        ? 'The 1 ticket here does not match this filter.'
        : `None of the ${total} tickets here match this filter.`
      : hidden === 0
        ? 'Filtered. Every ticket here matches.'
        : `Showing ${shown} of ${total}. ${hidden} hidden by this filter.`

  return (
    <Group gap={6} wrap="wrap" aria-live="polite" px={2} style={{ rowGap: 0 }}>
      <Text size="xs" c="var(--ps-text-muted)">
        {message}
      </Text>
      <Button size="compact-xs" variant="subtle" onClick={onClear}>
        Clear filter
      </Button>
    </Group>
  )
}
