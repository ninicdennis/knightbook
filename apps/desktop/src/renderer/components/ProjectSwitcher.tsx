import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconFolderOpen,
  IconInfoCircle,
  IconMenu2,
  IconX,
} from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { RememberedProject } from '../../shared/contract.js'

/**
 * The way to move between projects. The list is read each time the drawer opens,
 * so a folder that disappeared since last time is shown as unavailable rather
 * than trusted from an earlier look.
 */

interface Props {
  currentPath: string
  /** Set while switching would be unsafe; the reason is shown instead of the list being hidden. */
  blockedReason: string | null
  onSwitch: (path: string) => void
  onOpenFolder: () => void
}

export function ProjectSwitcher({ currentPath, blockedReason, onSwitch, onOpenFolder }: Props) {
  const [opened, drawer] = useDisclosure(false)
  const [projects, setProjects] = useState<RememberedProject[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    let cancelled = false
    setProjects(null)
    setError(null)
    window.projectspace.rememberedProjects().then(
      (list) => {
        if (!cancelled) setProjects(list)
      },
      () => {
        if (!cancelled) setError('Could not read the list of remembered projects.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [opened])

  const forget = useCallback(async (path: string) => {
    try {
      setProjects(await window.projectspace.forgetProject(path))
    } catch {
      setError('Could not forget that project. Nothing was changed.')
    }
  }, [])

  const choose = (path: string) => {
    drawer.close()
    onSwitch(path)
  }

  return (
    <>
      <Tooltip label="Projects" withArrow>
        <ActionIcon variant="default" size="lg" onClick={drawer.open} aria-label="Open project menu">
          <IconMenu2 size={18} />
        </ActionIcon>
      </Tooltip>

      <Drawer opened={opened} onClose={drawer.close} title="Projects" size="sm" padding="md">
        <Stack gap="md" style={{ minHeight: '100%' }}>
          {blockedReason && (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
              {blockedReason}
            </Alert>
          )}
          {error && (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          {projects === null && !error && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                Checking remembered projects…
              </Text>
            </Group>
          )}

          {projects?.length === 0 && (
            <Text size="sm" c="dimmed">
              No projects remembered yet.
            </Text>
          )}

          <Stack gap={6} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {projects?.map((project) => (
              <ProjectRow
                key={project.path}
                project={project}
                current={project.path === currentPath}
                blocked={blockedReason !== null}
                onChoose={() => choose(project.path)}
                onForget={() => void forget(project.path)}
              />
            ))}
          </Stack>

          <Stack gap="xs" mt="auto">
            <Button
              variant="default"
              leftSection={<IconFolderOpen size={16} />}
              disabled={blockedReason !== null}
              onClick={() => {
                drawer.close()
                onOpenFolder()
              }}
            >
              Open folder…
            </Button>
            <Group gap={6} align="flex-start" wrap="nowrap">
              <IconInfoCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} opacity={0.6} />
              <Text size="xs" c="dimmed">
                Switching only changes what this window shows. AI tools already connected keep
                using the project they were started with. This list is remembered on this machine
                only; forgetting a project never touches its files.
              </Text>
            </Group>
          </Stack>
        </Stack>
      </Drawer>
    </>
  )
}

interface RowProps {
  project: RememberedProject
  current: boolean
  blocked: boolean
  onChoose: () => void
  onForget: () => void
}

function ProjectRow({ project, current, blocked, onChoose, onForget }: RowProps) {
  const unavailable = project.unavailable !== null
  const cannotOpen = unavailable || blocked

  return (
    <Group
      component="li"
      gap={4}
      wrap="nowrap"
      align="stretch"
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-sm)',
        background: current ? 'var(--mantine-primary-color-light)' : undefined,
      }}
    >
      <UnstyledButton
        onClick={onChoose}
        disabled={cannotOpen}
        aria-current={current ? 'true' : undefined}
        aria-label={`Switch to ${project.name}`}
        p="xs"
        style={{ flex: 1, minWidth: 0, opacity: unavailable ? 0.7 : 1 }}
      >
        <Text size="sm" fw={current ? 700 : 500} truncate>
          {project.name}
          {current && (
            <Text span size="xs" c="dimmed" fw={400}>
              {' '}
              · open now
            </Text>
          )}
        </Text>
        <Box>
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {project.path}
          </Text>
          {project.unavailable && (
            <Text size="xs" c="orange" mt={2}>
              Unavailable. {project.unavailable}
            </Text>
          )}
        </Box>
      </UnstyledButton>

      {!current && (
        <Tooltip label="Forget this project. Its files are not touched." withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onForget}
            aria-label={`Forget ${project.name}`}
            style={{ alignSelf: 'center' }}
            mr={4}
          >
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  )
}
