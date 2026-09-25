import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertTriangle, IconFolderOpen, IconInfoCircle } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { FolderInspection } from '../../shared/contract.js'
import { CopyMcpConfig } from './CopyMcpConfig.js'

/**
 * A folder was chosen that holds no project records. That is the normal case for
 * a repository nothing has set up yet, so this explains what setup does and lets
 * the person do it here, without an AI tool and without spending any AI credit.
 */

interface Props {
  path: string
  onSetUp: (path: string, warning: string | null) => void
  onChooseAnother: () => void
}

const DESCRIPTIONS: Record<string, string> = {
  'README.md': 'README.md',
  docs: 'The docs folder',
}

export function SetupFolder({ path, onSetUp, onChooseAnother }: Props) {
  const [inspection, setInspection] = useState<FolderInspection | null>(null)
  const [name, setName] = useState('')
  const [include, setInclude] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.knightbook.inspectFolder(path).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setInspection(result.value)
        setName(result.value.name)
        setInclude(result.value.suggestions)
      } else {
        setError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [path])

  const setUp = async () => {
    setWorking(true)
    setError(null)
    const result = await window.knightbook.setUpFolder(path, name, include)
    setWorking(false)
    if (result.ok) onSetUp(result.value.path, result.value.warning)
    else setError(result.message)
  }

  return (
    // Centered when there is room; top-aligned and scrollable when there is not, so
    // a short window never clips the title out of reach.
    <Box style={{ height: '100%', overflowY: 'auto', display: 'flex' }}>
      <Stack gap="lg" w={560} maw="100%" py="md" style={{ margin: 'auto' }}>
        <Stack gap={4}>
          <Title order={2}>Set up this folder</Title>
          <Text size="sm" style={{ wordBreak: 'break-all' }}>
            {path}
          </Text>
        </Stack>

        <Alert icon={<IconInfoCircle size={18} />} color="blue" variant="light">
          <Stack gap={6}>
            <Text size="sm">
              A Knightbook project is a shared workspace of Markdown documents and a Kanban board
              that you and your AI tools both work in.
            </Text>
            <Text size="sm">
              Setting up adds one folder, <code>.projectspace</code>, and changes no existing file.
              Nothing has been written yet.
            </Text>
          </Stack>
        </Alert>

        {error && (
          <Alert
            icon={<IconAlertTriangle size={18} />}
            color="orange"
            variant="light"
            title="Could not set up this folder"
          >
            {error}
          </Alert>
        )}

        {!inspection && !error && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              Looking at the folder…
            </Text>
          </Group>
        )}

        {inspection && (
          <Stack gap="sm">
            <TextInput
              label="Project name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              disabled={working}
            />

            {inspection.suggestions.length > 0 && (
              <Checkbox.Group
                label="Documents already here"
                description="Included where they are, so they show up in the Documents view. Nothing is moved, copied or edited."
                value={include}
                onChange={setInclude}
              >
                <Stack gap={6} mt="xs">
                  {inspection.suggestions.map((suggestion) => (
                    <Checkbox
                      key={suggestion}
                      value={suggestion}
                      label={DESCRIPTIONS[suggestion] ?? suggestion}
                      disabled={working}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
            )}

            <Group gap="xs">
              <Button loading={working} onClick={() => void setUp()}>
                Set up this folder
              </Button>
              <Button
                variant="subtle"
                leftSection={<IconFolderOpen size={16} />}
                disabled={working}
                onClick={onChooseAnother}
              >
                Choose a different folder
              </Button>
            </Group>
          </Stack>
        )}

        {inspection && (
          <Stack gap={6}>
            <Text size="xs" fw={600} c="dimmed">
              Connecting an AI tool
            </Text>
            <Text size="xs" c="dimmed">
              Optional, and you can do it any time. Copy this configuration into your AI client
              once; it covers every project you allow. After setup, turn on Allow AI access through
              MCP in the status bar at the bottom to make this project reachable. The client starts
              the server itself, so the app does not need to be open.
            </Text>
            <Group>
              <CopyMcpConfig label="Copy MCP configuration" />
            </Group>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
