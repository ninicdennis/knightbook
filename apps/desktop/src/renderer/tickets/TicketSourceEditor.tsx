import { Alert, Button, Group, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { TicketSourceEdit } from './useTicketSourceEdit.js'

/**
 * A ticket's title and body as plain Markdown source, in the dialog's reading
 * region. It is a deliberately small step before the formatted editor (ticket
 * b217a95f): the user can correct wording today, and the frontmatter that
 * carries status, links and review state is never shown or sent.
 */
export function TicketSourceEditor({ edit }: { edit: TicketSourceEdit }) {
  const { draft, saveState } = edit
  if (draft === null) return null
  const locked = saveState.kind === 'saving' || saveState.kind === 'conflict'

  return (
    <Stack gap="md">
      {saveState.kind === 'conflict' && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          title="This ticket changed after you started editing"
        >
          It was changed somewhere else, in the app, through MCP or in another editor, so your edit
          was not saved and nothing was overwritten. Your text is still below: copy anything you
          want to keep, then load the current version.
        </Alert>
      )}
      {saveState.kind === 'failed' && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          title="Your edit was not saved"
        >
          {saveState.message} Your text is still below.
        </Alert>
      )}
      <TextInput
        label="Title"
        value={draft.title}
        readOnly={locked}
        error={draft.title.trim() === '' ? 'A ticket needs a title.' : undefined}
        onChange={(event) => edit.setDraft({ ...draft, title: event.currentTarget.value })}
      />
      <Textarea
        label="Body"
        description="Markdown source. Status, links and dates live in the file's frontmatter, which is not shown here and is not changed."
        rows={16}
        resize="vertical"
        readOnly={locked}
        styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
        value={draft.body}
        onChange={(event) => edit.setDraft({ ...draft, body: event.currentTarget.value })}
      />
    </Stack>
  )
}

/** The editor's controls, in the dialog's fixed action bar. */
export function TicketSourceEditorActions({
  edit,
  onClose,
}: {
  edit: TicketSourceEdit
  onClose: () => void
}) {
  const { draft, saveState, confirmDiscard } = edit

  if (confirmDiscard !== null) {
    return (
      <Group justify="space-between" gap="xs">
        <Text size="sm">Discard your unsaved edit to this ticket?</Text>
        <Group gap="xs">
          <Button variant="default" size="xs" onClick={edit.keepEditing}>
            Keep editing
          </Button>
          <Button
            color="red"
            size="xs"
            onClick={() => {
              edit.stop()
              if (confirmDiscard === 'close') onClose()
            }}
          >
            Discard edit
          </Button>
        </Group>
      </Group>
    )
  }

  if (saveState.kind === 'conflict') {
    return (
      <Group justify="flex-end">
        <Button size="xs" onClick={edit.stop}>
          Discard my edit and load the current version
        </Button>
      </Group>
    )
  }

  return (
    <Group justify="flex-end" gap="xs">
      <Button variant="default" size="xs" onClick={() => edit.leave('cancel')}>
        Cancel
      </Button>
      <Button
        size="xs"
        loading={saveState.kind === 'saving'}
        disabled={draft === null || draft.title.trim() === ''}
        onClick={() => void edit.submit()}
      >
        Save
      </Button>
    </Group>
  )
}
