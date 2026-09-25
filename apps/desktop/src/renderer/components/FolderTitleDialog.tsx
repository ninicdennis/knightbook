import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'

/**
 * Names a document folder, such as "Documentation" for `docs`. The title is
 * stored in the project manifest, so AI tools see it too; the folder itself is
 * never renamed, and the dialog says so.
 */

/** Matches FOLDER_TITLE_MAX_LENGTH in core, which is what actually enforces it. */
const MAX_LENGTH = 80

interface Props {
  /** The folder being named, or null when the dialog is closed. */
  folder: { path: string; title: string | null } | null
  /** Saves a title, or clears it with null. Resolves to a failure message, or null. */
  onSave: (folder: string, title: string | null) => Promise<string | null>
  onClose: () => void
}

export function FolderTitleDialog({ folder, onSave, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The folder last shown, so the text does not go blank while the dialog fades out.
  const [shown, setShown] = useState(folder)

  useEffect(() => {
    if (!folder) return
    setShown(folder)
    setTitle(folder.title ?? '')
    setError(null)
  }, [folder])

  const save = async (next: string | null) => {
    if (!folder) return
    setSaving(true)
    const failure = await onSave(folder.path, next)
    setSaving(false)
    if (failure) setError(failure)
    else onClose()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() !== '') void save(title)
  }

  return (
    <Modal opened={folder !== null} onClose={onClose} title="Folder title" centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="Title"
            description={`Shown instead of “${shown?.path ?? ''}” in the Documents list.`}
            value={title}
            maxLength={MAX_LENGTH}
            onChange={(event) => setTitle(event.currentTarget.value)}
            data-autofocus
          />
          <Text size="xs" c="var(--ps-text-muted)">
            The folder and its files are not renamed or moved. The title is saved in the project,
            where AI tools can read it too.
          </Text>
          {error && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              {error}
            </Alert>
          )}
          <Group justify="space-between" gap="xs">
            {folder?.title ? (
              <Button
                variant="subtle"
                color="gray"
                onClick={() => void save(null)}
                disabled={saving}
              >
                Clear title
              </Button>
            ) : (
              <span />
            )}
            <Group gap="xs">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} disabled={title.trim() === ''}>
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
