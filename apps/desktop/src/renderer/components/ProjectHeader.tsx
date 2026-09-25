import { ActionIcon, Kbd, SegmentedControl, Text, Tooltip, UnstyledButton } from '@mantine/core'
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
 *
 * Layout, including the narrow-window reflow, is in shell.css.
 */

export type View = 'board' | 'documents' | 'archive'

interface Props {
  name: string
  checkoutPath: string
  view: View
  onViewChange: (view: View) => void
  /** Shown on the Archive tab, so tickets taken off the board are not invisible. */
  archivedCount: number
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
  archivedCount,
  refreshing,
  onRefresh,
  switchBlockedReason,
  onSwitchProject,
  onOpenFolder,
  onOpenSearch,
}: Props) {
  return (
    <div className="ps-shell-header">
      <div className="ps-shell-identity">
        <ProjectSwitcher
          currentPath={checkoutPath}
          blockedReason={switchBlockedReason}
          onSwitch={onSwitchProject}
          onOpenFolder={onOpenFolder}
        />
        <ProjectIdentity name={name} checkoutPath={checkoutPath} />
      </div>

      {/* The centre belongs to search: it is the one thing here that is about
          finding work rather than about which project is open. */}
      <UnstyledButton
        className="ps-shell-search ps-shell-control"
        onClick={onOpenSearch}
        aria-label={`Search tickets (${SEARCH_SHORTCUT_LABEL})`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingInline: 10,
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <IconSearch size={15} opacity={0.6} style={{ flexShrink: 0 }} />
        <Text size="sm" c="var(--ps-text-muted)" style={{ flex: 1, minWidth: 0 }} truncate>
          Search tickets
        </Text>
        <Kbd size="xs" visibleFrom="lg" style={{ flexShrink: 0 }}>
          {SEARCH_SHORTCUT_LABEL}
        </Kbd>
      </UnstyledButton>

      <div className="ps-shell-actions">
        <SegmentedControl
          size="sm"
          value={view}
          onChange={(next) => onViewChange(next as View)}
          // Added to the shared segmented classes from theme.ts, not in place of them.
          classNames={{ root: 'ps-shell-views', label: 'ps-shell-views-label' }}
          data={[
            { value: 'board', label: 'Board' },
            { value: 'documents', label: 'Documents' },
            /*
             * The count is on the tab because the archive is otherwise
             * invisible: without it, a ticket that left the board looks lost
             * rather than put away. It is kept out of the board's own counts.
             */
            { value: 'archive', label: archivedCount > 0 ? `Archive ${archivedCount}` : 'Archive' },
          ]}
        />

        <div className="ps-shell-utilities">
          <Tooltip
            multiline
            w={280}
            withArrow
            label="Reload from the project files. This also happens when you return to this window."
          >
            <ActionIcon
              className="ps-shell-control"
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
        </div>
      </div>
    </div>
  )
}

/**
 * Name and checkout, each on one line. Both truncate rather than wrap, so a long
 * name or a deep path cannot push the controls off the window. The full text
 * stays in the document for assistive technology and in a tooltip on hover.
 */
function ProjectIdentity({ name, checkoutPath }: { name: string; checkoutPath: string }) {
  return (
    <div className="ps-shell-identity-text">
      <Tooltip label={name} openDelay={400} withArrow position="bottom-start">
        <h1 className="ps-shell-name" style={{ margin: 0 }}>
          {name}
        </h1>
      </Tooltip>
      {/* Identifying, not interesting: it has to be readable without competing
          with the project name above it or the board below. */}
      <Tooltip
        label={checkoutPath}
        openDelay={400}
        withArrow
        position="bottom-start"
        multiline
        maw="min(36rem, calc(100vw - 32px))"
        style={{ wordBreak: 'break-all' }}
      >
        <div className="ps-shell-path">
          <span>{checkoutPath}</span>
        </div>
      </Tooltip>
    </div>
  )
}
