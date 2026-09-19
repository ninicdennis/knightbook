import { Alert, Button, Card, Center, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconFolderOpen, IconHistory, IconInfoCircle } from '@tabler/icons-react'
import type { RememberedProject } from '../../shared/contract.js'

/**
 * The state before a project is open, and the state where a folder was chosen
 * but holds no project records. The second one is not an error: it is the normal
 * situation when the user picks a repository an AI tool has not set up yet.
 */

interface Props {
  recentProjects: RememberedProject[]
  notAProject: string | null
  onChoose: () => void
  onOpenRecent: (path: string) => void
}

export function Welcome({ recentProjects, notAProject, onChoose, onOpenRecent }: Props) {
  return (
    <Center style={{ height: '100%' }}>
      <Stack gap="lg" w={520} maw="100%">
        <Stack gap={4}>
          <Title order={2}>Projectspace</Title>
          <Text c="dimmed" size="sm">
            Open a project folder to see its documents and board. The folder can be an existing
            code repository.
          </Text>
        </Stack>

        {notAProject && (
          <Alert
            icon={<IconInfoCircle size={18} />}
            color="blue"
            variant="light"
            title="No project records here yet"
          >
            <Stack gap={6}>
              <Text size="sm" style={{ wordBreak: 'break-all' }}>
                {notAProject}
              </Text>
              <Text size="sm">
                Nothing was changed. An AI tool connected to this folder can create the project
                through MCP, which also fills in documentation for an application that already
                exists.
              </Text>
            </Stack>
          </Alert>
        )}

        <Button
          leftSection={<IconFolderOpen size={18} />}
          size="md"
          onClick={onChoose}
          fullWidth
        >
          Choose a project folder
        </Button>

        {recentProjects.length > 0 && (
          <Stack gap="xs">
            <Group gap={6}>
              <IconHistory size={14} opacity={0.6} />
              <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>
                Recent
              </Text>
            </Group>
            {recentProjects.map(({ path, name }) => (
              <UnstyledButton key={path} onClick={() => onOpenRecent(path)}>
                <Card withBorder padding="xs" radius="sm">
                  <Text size="sm" fw={500}>
                    {name}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                    {path}
                  </Text>
                </Card>
              </UnstyledButton>
            ))}
            <Text size="xs" c="dimmed">
              Remembered on this machine only. It is not part of the project, so it never travels
              through Git.
            </Text>
          </Stack>
        )}
      </Stack>
    </Center>
  )
}
