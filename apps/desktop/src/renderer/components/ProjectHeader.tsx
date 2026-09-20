import {
  ActionIcon,
  Group,
  Kbd,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { IconRefresh, IconSearch } from '@tabler/icons-react'
import { ProjectSwitcher } from './ProjectSwitcher.js'
import { SettingsDrawer } from './SettingsDrawer.js'
import { SEARCH_SHORTCUT_LABEL } from '../shortcuts.js'

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
  onOpenSearch: () => void
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
  onOpenSearch,
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

      {/* The centre belongs to search: it is the one thing here that is about
          finding work rather than about which project is open. It shrinks before
          it wraps, so a long project name squeezes it instead of breaking the row. */}
      <Group justify="center" style={{ flex: 1, minWidth: 0 }} px="sm">
        <UnstyledButton
          onClick={onOpenSearch}
          aria-label={`Search tickets (${SEARCH_SHORTCUT_LABEL})`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            maxWidth: 360,
            minWidth: 0,
            padding: '6px 10px',
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--ps-hairline)',
            background: 'var(--ps-card-bg)',
          }}
        >
          <IconSearch size={15} opacity={0.6} style={{ flexShrink: 0 }} />
          <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }} truncate>
            Search tickets
          </Text>
          <Kbd size="xs" visibleFrom="md" style={{ flexShrink: 0 }}>
            {SEARCH_SHORTCUT_LABEL}
          </Kbd>
        </UnstyledButton>
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
