import { Alert, Button, Group, Stack, Textarea } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/**
 * Why a ticket cannot move, shown and edited in the detail view. Until this
 * existed a blocker could only be written through MCP or by hand, so a person
 * could read one but never record or clear their own.
 *
 * Saving blank text clears the blocker; the host stores that as no blocker at
 * all, never as an empty one.
 *
 * Whether it is being edited is decided outside, because adding a blocker is
 * started from the dialog's Edit menu. With no blocker and no edit open, this
 * shows nothing at all.
 */

interface Props {
  blocker: string | null
  onSave: (blocker: string | null) => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
}

export function TicketBlocker({ blocker, onSave, editing, onEditingChange }: Props) {
  if (editing) {
    return (
      <BlockerEditor
        blocker={blocker}
        onSave={(next) => {
          if (next !== blocker) onSave(next)
          onEditingChange(false)
        }}
        onCancel={() => onEditingChange(false)}
      />
    )
  }

  if (blocker === null) return null

  return (
    <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="Blocked">
      <Stack gap="xs">
        <span style={{ whiteSpace: 'pre-wrap' }}>{blocker}</span>
        <Group gap="xs">
          <Button
            variant="light"
            color="orange"
            size="compact-xs"
            onClick={() => onEditingChange(true)}
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

/**
 * Mounted afresh for each edit, so it always starts from the blocker as it is
 * when the edit opens, and a board refresh during the edit cannot reset the text.
 */
function BlockerEditor({
  blocker,
  onSave,
  onCancel,
}: {
  blocker: string | null
  onSave: (blocker: string | null) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(blocker ?? '')
  const field = useRef<HTMLTextAreaElement>(null)

  // The user just asked to write a reason, so the field takes focus when it
  // opens, with the caret after any existing text rather than before it. Taking
  // focus also scrolls it into view when the edit was started from the footer.
  useEffect(() => {
    const node = field.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  const save = (): void => onSave(draft.trim() === '' ? null : draft.trim())

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      onCancel()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      save()
    }
  }

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
        <Button variant="default" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" onClick={save}>
          Save blocker
        </Button>
      </Group>
    </Stack>
  )
}
