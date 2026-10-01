import { Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useState, type FormEvent } from 'react'

/**
 * Asks for one title: a new plan's, a new phase's, or a phase's new name. The
 * host trims and checks it again; this only keeps an empty one from being sent.
 */
export function TitleDialog({
  heading,
  label,
  action,
  initial = '',
  onClose,
  onSubmit,
}: {
  heading: string
  label: string
  action: string
  initial?: string
  onClose: () => void
  onSubmit: (title: string) => void
}) {
  const [title, setTitle] = useState(initial)
  const trimmed = title.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmed === '') return
    onSubmit(trimmed)
  }

  return (
    <Modal opened onClose={onClose} title={heading} centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label={label}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            data-autofocus
            required
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed === '' || trimmed === initial.trim()}>
              {action}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
