import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react'
import { useState } from 'react'

/**
 * Facts about the ticket's record rather than decisions about the work, so they
 * sit under the badges instead of among Review and Accept, and stay quieter than
 * both. Editing the file outside never records a review or acceptance; the
 * window's focus refresh just shows what the file now says.
 *
 * The id is shown as its first eight characters, the form this project's own
 * notes use and the start of the filename in `.projectspace/tickets/`. What is
 * copied is always the whole id, because that is what `depends_on` and the MCP
 * tools take.
 */

const SHORT_ID_LENGTH = 8

export function TicketRecordRow({ rootPath, ticketId }: { rootPath: string; ticketId: string }) {
  const [opening, setOpening] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const clipboard = useClipboard({ timeout: 2000 })
  const shortId = ticketId.slice(0, SHORT_ID_LENGTH)

  async function openFile() {
    setOpening(true)
    setFailure(null)
    const result = await window.knightbook.openTicketExternally(rootPath, ticketId)
    setOpening(false)
    if (!result.ok) setFailure(result.message)
  }

  const copyLabel = clipboard.error
    ? 'Could not copy the ticket id'
    : clipboard.copied
      ? 'Copied the full ticket id'
      : `Copy the full ticket id, ${ticketId}`

  return (
    <Group gap="xs" wrap="wrap">
      <Group gap={2} wrap="nowrap">
        <Tooltip label={ticketId} withArrow>
          <Text size="xs" ff="monospace" c="var(--ps-text-muted)">
            {shortId}
          </Text>
        </Tooltip>
        <Tooltip label={copyLabel} withArrow>
          <ActionIcon
            size="sm"
            variant="subtle"
            color={clipboard.error ? 'red' : 'gray'}
            aria-label={copyLabel}
            onClick={() => clipboard.copy(ticketId)}
          >
            {clipboard.copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          </ActionIcon>
        </Tooltip>
      </Group>
      <Tooltip label="Open this ticket's Markdown file in your own editor" withArrow>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconExternalLink size={12} />}
          loading={opening}
          onClick={() => void openFile()}
        >
          Edit externally
        </Button>
      </Tooltip>
      {(failure || clipboard.error) && (
        <Text size="xs" c="red" role="alert">
          {failure ?? 'The ticket id could not be copied to the clipboard.'}
        </Text>
      )}
    </Group>
  )
}
