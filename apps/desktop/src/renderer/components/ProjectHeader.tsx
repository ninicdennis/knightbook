import { ActionIcon, Group, SegmentedControl, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { ProjectSwitcher } from './ProjectSwitcher.js'
import { SettingsDrawer } from './SettingsDrawer.js'

/**
 * The header names the project and the checkout it came from. Technical design
 * section 4 asks for checkout identity to be visible, because two clones share a
 * project id and only the path distinguishes them.
 *
 * MCP status and the connection actions live in the footer instead, so there is
 * one place to look for "can my AI tool reach this project" rather than two.
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
          {/* Identifying, not interesting: it has to be readable without competing
              with the project name above it or the board below. */}
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all', opacity: 0.75 }}>
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

        <SettingsDrawer />
      </Group>
    </Group>
  )
}
