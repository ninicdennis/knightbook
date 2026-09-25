import { Alert, Button, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

/** The two screens shown instead of a board: while a project is read, and when it could not be. */

export function LoadingProject() {
  return (
    <Center style={{ height: '100%' }}>
      <Stack align="center" gap="xs">
        <Loader />
        <Text size="sm" c="dimmed">
          Reading project files…
        </Text>
      </Stack>
    </Center>
  )
}

interface FailedProps {
  path: string
  message: string
  onRetry: () => void
  onChooseAnother: () => void
}

export function ProjectLoadFailed({ path, message, onRetry, onChooseAnother }: FailedProps) {
  return (
    <Center style={{ height: '100%' }}>
      <Alert
        icon={<IconAlertTriangle size={18} />}
        color="orange"
        variant="light"
        title="Could not open this project"
        w={560}
        maw="100%"
      >
        <Stack gap="sm">
          <Text size="sm" style={{ wordBreak: 'break-all' }}>
            {path}
          </Text>
          <Text size="sm">{message}</Text>
          <Text size="xs" c="dimmed">
            Nothing was changed. Your files are exactly as they were.
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={onRetry}
            >
              Try again
            </Button>
            <Button size="xs" variant="subtle" onClick={onChooseAnother}>
              Open a different folder
            </Button>
          </Group>
        </Stack>
      </Alert>
    </Center>
  )
}
