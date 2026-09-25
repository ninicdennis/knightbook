import { Alert, Button, Group, Stack, Textarea } from '@mantine/core'
import { IconAlertTriangle, IconHandStop } from '@tabler/icons-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/**
 * Why a ticket cannot move, shown and edited in the detail view. Until this
 * existed a blocker could only be written through MCP or by hand, so a person
 * could read one but never record or clear their own.
 *
 * Saving blank text clears the blocker; the host stores that as no blocker at
 * all, never as an empty one.
 */

interface Props {
  blocker: string | null
  onSave: (blocker: string | null) => void
}

export function TicketBlocker({ blocker, onSave }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const editing = draft !== null

  // The user just asked to write a reason, so the field takes focus when it
  // opens, with the caret after any existing text rather than before it.
  useEffect(() => {
    const node = field.current
    if (!editing || !node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [editing])

  const save = (): void => {
    if (draft === null) return
    const next = draft.trim() === '' ? null : draft.trim()
    if (next !== blocker) onSave(next)
    setDraft(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      setDraft(null)
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      save()
    }
  }

  if (draft !== null) {
    return (
      <Stack gap="xs">
        <Textarea
          label="Why this ticket cannot move"
          description="Leave it empty and save to clear the blocker. Ctrl+Enter saves, Escape cancels."
          rows={3}
          ref={field}
          // The dialog closes on Escape from a window listener in the capture
          // phase, which no handler here can stop; this attribute is Mantine's
          // own opt-out, so Escape cancels the edit instead of losing the draft.
          data-mantine-stop-propagation="true"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <Group gap="xs" justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button size="xs" onClick={save}>
            Save blocker
          </Button>
        </Group>
      </Stack>
    )
  }

  if (blocker === null) {
    return (
      <Group justify="flex-end">
        <Button
          variant="subtle"
          size="compact-sm"
          color="gray"
          leftSection={<IconHandStop size={14} />}
          onClick={() => setDraft('')}
        >
          Add a blocker
        </Button>
      </Group>
    )
  }

  return (
    <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="Blocked">
      <Stack gap="xs">
        <span style={{ whiteSpace: 'pre-wrap' }}>{blocker}</span>
        <Group gap="xs">
          <Button
            variant="light"
            color="orange"
            size="compact-xs"
            onClick={() => setDraft(blocker)}
          >
            Edit
          </Button>
          <Button variant="subtle" color="orange" size="compact-xs" onClick={() => onSave(null)}>
            Clear blocker
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}
