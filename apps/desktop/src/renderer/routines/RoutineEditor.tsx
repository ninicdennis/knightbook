import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import type { RoutineEdit } from '../../shared/routines-contract.js'

/**
 * A routine's title and instructions as Markdown source, for a new routine or
 * an existing one. Runs already started keep their own copy, so saving here
 * changes only the runs started after it.
 */

export const NEW_ROUTINE_INSTRUCTIONS = [
  '## What to do',
  '',
  '- ',
  '',
  '## When',
  '',
  'For example, weekly. Knightbook does not start runs on its own.',
  '',
].join('\n')

interface Props {
  heading: string
  action: string
  initial: RoutineEdit
  /** Explains what saving does to runs already started; only an existing routine has any. */
  note?: string
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (edit: RoutineEdit) => void
}

export function RoutineEditor({
  heading,
  action,
  initial,
  note,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initial.title)
  const [instructions, setInstructions] = useState(initial.instructions)
  const trimmed = title.trim()
  const unchanged = trimmed === initial.title && instructions === initial.instructions

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmed === '' || unchanged || saving) return
    onSubmit({ title: trimmed, instructions })
  }

  return (
    <Modal opened onClose={onClose} title={heading} size="lg" centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="Title"
            required
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            data-autofocus
          />
          <Textarea
            label="Instructions"
            description={
              note ?? 'Markdown. Each run starts as a ticket with a copy of these instructions.'
            }
            rows={12}
            value={instructions}
            onChange={(event) => setInstructions(event.currentTarget.value)}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          />
          {error && (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
              title="The routine was not saved"
            >
              {error}
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed === '' || unchanged} loading={saving}>
              {action}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
