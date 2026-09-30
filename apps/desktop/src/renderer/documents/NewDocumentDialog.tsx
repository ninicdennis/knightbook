import { Alert, Button, Group, Modal, Radio, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { CreatedDocumentView } from '../../shared/documents-contract.js'
import {
  TEMPLATES,
  templateContent,
  titleFromFileName,
  type TemplateId,
} from './document-templates.js'

/**
 * Creating a Markdown document inside the project, blank or from a starting
 * point. The folder and name are the user's; the host has the final word on
 * whether the path is allowed, and never overwrites a file that is there.
 *
 * A refusal keeps the dialog open with everything as typed, so fixing a name
 * clash is one edit, not starting over.
 */

interface Props {
  rootPath: string
  opened: boolean
  /** Where to suggest creating it: the folder of the document being read, if any. */
  suggestedFolder: string
  onClose: () => void
  onCreated: (created: CreatedDocumentView) => void
}

/** The project-relative path the fields describe, or why they do not describe one. */
export function pathFromFields(
  folder: string,
  name: string,
): { path: string } | { problem: string } {
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, '')
  const cleanName = name.trim()
  if (!cleanName) return { problem: 'Give the document a file name.' }
  if (/[\\/]/.test(cleanName)) {
    return { problem: 'The file name cannot contain a slash; put folders in Folder.' }
  }
  if (cleanFolder.includes('\\')) return { problem: 'Use forward slashes between folders.' }
  const fileName = /\.md$/i.test(cleanName) ? cleanName : `${cleanName}.md`
  return { path: cleanFolder ? `${cleanFolder}/${fileName}` : fileName }
}

export function NewDocumentDialog({
  rootPath,
  opened,
  suggestedFolder,
  onClose,
  onCreated,
}: Props) {
  const [folder, setFolder] = useState(suggestedFolder)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<TemplateId>('blank')
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!opened) return
    setFolder(suggestedFolder)
    setName('')
    setTemplate('blank')
    setFailure(null)
  }, [opened, suggestedFolder])

  const target = pathFromFields(folder, name)

  async function create() {
    if (!('path' in target)) {
      setFailure(target.problem)
      return
    }
    setSaving(true)
    setFailure(null)
    const fileName = target.path.split('/').pop() ?? target.path
    const today = new Date().toISOString().slice(0, 10)
    const content = templateContent(template, titleFromFileName(fileName), today)
    const result = await window.knightbook.createDocument(rootPath, target.path, content)
    setSaving(false)
    if (result.ok) onCreated(result.value)
    else setFailure(result.message)
  }

  return (
    <Modal opened={opened} onClose={onClose} title="New document" size="md">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <Stack gap="sm">
          <TextInput
            label="Folder"
            description="Inside this project. Leave empty for the project's top folder."
            placeholder="docs"
            value={folder}
            onChange={(event) => setFolder(event.currentTarget.value)}
          />
          <TextInput
            label="File name"
            placeholder="notes.md"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
            required
          />
          <Radio.Group
            label="Start from"
            value={template}
            onChange={(value) => setTemplate(value as TemplateId)}
          >
            <Stack gap={6} mt={4}>
              {TEMPLATES.map((option) => (
                <Radio
                  key={option.id}
                  value={option.id}
                  label={option.label}
                  description={option.description}
                />
              ))}
            </Stack>
          </Radio.Group>
          <Text size="xs" c="var(--ps-text-muted)">
            {'path' in target
              ? `Creates ${target.path} and includes it. An existing file is never overwritten.`
              : target.problem}
          </Text>
          {failure && (
            <Alert color="orange" variant="light" role="alert">
              {failure}
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!('path' in target)}>
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
