import {
  ActionIcon,
  Code,
  CopyButton,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { IconCheck, IconPlugConnected, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { McpLaunchCommand } from '../../shared/contract.js'
import { ProjectSwitcher } from './ProjectSwitcher.js'

/**
 * The header names the project and the checkout it came from. Technical design
 * section 4 asks for checkout identity to be visible, because two clones share a
 * project id and only the path distinguishes them.
 *
 * It also surfaces the MCP launch command, which is the one piece of setup the
 * user has to move into their AI client by hand.
 */

export type View = 'board' | 'documents'

interface Props {
  name: string
  checkoutPath: string
  view: View
  onViewChange: (view: View) => void
  refreshing: boolean
  onRefresh: () => void
  /** Why switching is unsafe right now, or null. */
  switchBlockedReason: string | null
  onSwitchProject: (path: string) => void
  onOpenFolder: () => void
}

export function ProjectHeader({
  name,
  checkoutPath,
  view,
  onViewChange,
  refreshing,
  onRefresh,
  switchBlockedReason,
  onSwitchProject,
  onOpenFolder,
}: Props) {
  const [launch, setLaunch] = useState<McpLaunchCommand | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.projectspace.mcpLaunchCommand(checkoutPath).then((command) => {
      if (!cancelled) setLaunch(command)
    })
    return () => {
      cancelled = true
    }
  }, [checkoutPath])

  const configJson = launch
    ? JSON.stringify({ command: launch.command, args: launch.args }, null, 2)
    : ''

  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
        <ProjectSwitcher
          currentPath={checkoutPath}
          blockedReason={switchBlockedReason}
          onSwitch={onSwitchProject}
          onOpenFolder={onOpenFolder}
        />
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Title order={3}>{name}</Title>
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {checkoutPath}
          </Text>
        </Stack>
      </Group>

      <Group gap="xs" wrap="nowrap">
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(next) => onViewChange(next as View)}
          data={[
            { value: 'board', label: 'Board' },
            { value: 'documents', label: 'Documents' },
          ]}
        />

        <Tooltip
          multiline
          w={280}
          withArrow
          label="Reload from the project files. This also happens when you return to this window."
        >
          <ActionIcon
            variant="default"
            size="lg"
            loading={refreshing}
            onClick={onRefresh}
            aria-label="Refresh from disk"
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>

        {configJson && (
          <CopyButton value={configJson} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip
                multiline
                w={320}
                withArrow
                label={
                  copied
                    ? 'Copied. Paste it into your AI client config.'
                    : 'Copy this project’s MCP configuration for your AI client.'
                }
              >
                <ActionIcon
                  variant="default"
                  size="lg"
                  onClick={copy}
                  aria-label="Copy MCP configuration"
                >
                  {copied ? <IconCheck size={18} /> : <IconPlugConnected size={18} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        )}
      </Group>
    </Group>
  )
}

/** Shown on the welcome screen so setup is discoverable before a project is open. */
export function LaunchCommandHint({ command }: { command: McpLaunchCommand }) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        Your AI client starts this itself, so project access does not need this window open.
      </Text>
      <Code block>{`${command.command}\n${command.args.join(' ')}`}</Code>
    </Stack>
  )
}
