import { Alert, Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { TicketType } from '../../shared/contract.js'
import type { NewTicketInput } from '../../shared/ticket-create-contract.js'
import { TICKET_TYPE_EMOJI, TICKET_TYPE_LABEL, TICKET_TYPES } from '../ticket-types.js'

/**
 * A new Backlog ticket, written by the same core path an AI tool's
 * `ticket_create` uses. The body starts from the shape the board's tickets
 * already share, and stays ordinary Markdown the user can change or clear.
 */

export const NEW_TICKET_SECTIONS = [
  '## Intended outcome',
  '',
  '',
  '## Acceptance criteria',
  '',
  '- ',
  '',
  '## Notes',
  '',
].join('\n')

/** Every ticket on the board opens with its title as a heading; a new one does too. */
export function newTicketBody(title: string, sections: string): string {
  return `# ${title}\n\n${sections.trim() === '' ? '' : `${sections.trimEnd()}\n`}`
}

const NO_TYPE = 'none'

interface Props {
  opened: boolean
  /** Set while the write is in flight; the form stays up until it succeeds. */
  saving: boolean
  /** Why the last attempt failed, shown in the form rather than closing it. */
  error: string | null
  onClose: () => void
  onCreate: (input: NewTicketInput) => void
}

export function NewTicketDialog({ opened, saving, error, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<string>(NO_TYPE)
  const [sections, setSections] = useState(NEW_TICKET_SECTIONS)

  // Each opening starts a fresh ticket rather than resuming the last one.
  useEffect(() => {
    if (!opened) return
    setTitle('')
    setType(NO_TYPE)
    setSections(NEW_TICKET_SECTIONS)
  }, [opened])

  const trimmedTitle = title.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmedTitle === '' || saving) return
    onCreate({
      title: trimmedTitle,
      type: type === NO_TYPE ? null : (type as TicketType),
      body: newTicketBody(trimmedTitle, sections),
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="New ticket in Backlog" size="lg" centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="Title"
            required
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            data-autofocus
          />
          <Select
            label="Type"
            description="Optional. What kind of work this is, not where it stands."
            data={[
              { value: NO_TYPE, label: 'No type' },
              ...TICKET_TYPES.map((value) => ({
                value,
                label: `${TICKET_TYPE_EMOJI[value]} ${TICKET_TYPE_LABEL[value]}`,
              })),
            ]}
            value={type}
            onChange={(value) => setType(value ?? NO_TYPE)}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
          <Textarea
            label="Body"
            description="Markdown. Change or remove any of these sections."
            rows={12}
            value={sections}
            onChange={(event) => setSections(event.currentTarget.value)}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          />
          {error && (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
              title="The ticket was not created"
            >
              {error}
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmedTitle === ''} loading={saving}>
              Create ticket
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
