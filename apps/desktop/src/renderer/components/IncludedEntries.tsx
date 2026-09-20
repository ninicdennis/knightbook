import { ActionIcon, Button, Group, Menu, Modal, Stack, Text, Tooltip } from '@mantine/core'
import { IconFilePlus, IconFolderPlus, IconPlus, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import type { DocumentListView } from '../../shared/contract.js'

/**
 * The manifest entries, which are the things a person can actually add and
 * remove. A document included through a folder has no entry of its own, so
 * listing documents alone would offer a removal that cannot be performed.
 *
 * Decision D-011: every operation here edits the manifest only. Nothing is
 * copied, moved, or deleted, and the confirmation says so, because "remove" is
 * the word people expect to mean deletion.
 */

interface Entry {
  path: string
  /** How many documents this entry currently contributes. */
  count: number
  /** Why the entry no longer resolves, or null when it does. */
  problem: 'missing' | 'not_readable' | null
}

function entriesOf(listing: DocumentListView): Entry[] {
  const counts = new Map<string, number>()
  for (const document of listing.documents) {
    counts.set(document.includedVia, (counts.get(document.includedVia) ?? 0) + 1)
  }

  const entries: Entry[] = [...counts].map(([path, count]) => ({ path, count, problem: null }))
  for (const problem of listing.problems) {
    entries.push({ path: problem.path, count: 0, problem: problem.reason })
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : 1))
}

interface Props {
  listing: DocumentListView
  busy: boolean
  onIncludeFiles: () => void
  onIncludeFolder: () => void
  onRemove: (entry: string) => void
}

export function IncludedEntries({
  listing,
  busy,
  onIncludeFiles,
  onIncludeFolder,
  onRemove,
}: Props) {
  const [pending, setPending] = useState<Entry | null>(null)
  const entries = entriesOf(listing)

  return (
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>
          Included from
        </Text>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />}>
              Include
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFilePlus size={14} />} onClick={onIncludeFiles}>
              Markdown files…
            </Menu.Item>
            <Menu.Item leftSection={<IconFolderPlus size={14} />} onClick={onIncludeFolder}>
              A folder…
            </Menu.Item>
            <Menu.Label>Files stay where they are.</Menu.Label>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {entries.length === 0 && (
        <Text size="xs" c="dimmed">
          Nothing is included yet.
        </Text>
      )}

      {entries.map((entry) => (
        <Group key={entry.path} justify="space-between" wrap="nowrap" gap={4}>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="xs" style={{ wordBreak: 'break-all' }}>
              {entry.path}
            </Text>
            <Text size="xs" c={entry.problem ? 'orange' : 'dimmed'}>
              {entry.problem === 'missing'
                ? 'no longer exists'
                : entry.problem === 'not_readable'
                  ? 'could not be read'
                  : entry.count === 1
                    ? '1 document'
                    : `${entry.count} documents`}
            </Text>
          </Stack>
          <Tooltip label={`Remove ${entry.path} from this workspace`} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              disabled={busy}
              aria-label={`Remove ${entry.path} from this workspace`}
              onClick={() => setPending(entry)}
            >
              <IconX size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ))}

      <Modal
        opened={pending !== null}
        onClose={() => setPending(null)}
        title="Remove from this workspace?"
        centered
      >
        <Stack gap="md">
          <Text size="sm" style={{ wordBreak: 'break-all' }}>
            {pending?.path}
          </Text>
          <Text size="sm" c="dimmed">
            {pending?.problem
              ? 'This entry no longer resolves. Dropping it changes nothing on disk.'
              : pending?.count === 1
                ? 'This takes 1 document out of the workspace. The file stays exactly where it is on disk.'
                : `This takes ${pending?.count ?? 0} documents out of the workspace. The files stay exactly where they are on disk.`}
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              color="orange"
              onClick={() => {
                if (pending) onRemove(pending.path)
                setPending(null)
              }}
            >
              Remove the entry
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
