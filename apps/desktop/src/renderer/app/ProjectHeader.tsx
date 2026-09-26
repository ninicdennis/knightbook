import { Kbd, Tabs, Text, Tooltip, UnstyledButton, em } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { ProjectSwitcher } from '../projects/ProjectSwitcher.js'
import { SettingsDrawer } from './SettingsDrawer.js'
import { KnightbookMark } from './TitleBar.js'
import { SEARCH_SHORTCUT_LABEL } from './shortcuts.js'

/**
 * The header, in two rows. The first says where you are and holds the tools
 * that work from anywhere: the project menu, search, and settings. The second
 * moves between the project's views. Keeping them apart is what lets each read
 * as one kind of thing, where one crowded row made a project path, a search
 * box, four boxed tabs and two icons compete for the same glance.
 *
 * The checkout path is not shown here. It lives in the project menu, one click
 * away, because it tells two clones apart but is not something to read on every
 * glance (technical design section 4). Manual refresh lives in the footer.
 * The first row is also the window's title bar, with the logo at its start.
 *
 * Layout, including the narrow-window reflow, is in shell.css.
 */

export type View = 'board' | 'documents' | 'plans' | 'archive'

interface Props {
  name: string
  checkoutPath: string
  view: View
  onViewChange: (view: View) => void
  /** Shown on the Archive tab, so tickets taken off the board are not invisible. */
  archivedCount: number
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
  switchBlockedReason,
  onSwitchProject,
  onOpenFolder,
  onOpenSearch,
}: Props) {
  return (
    <div className="ps-shell-header">
      {/* Also the window's title bar (D-030): see TitleBar.tsx and shell.css. */}
      <div className="ps-shell-top ps-titlebar">
        <div className="ps-shell-identity">
          <KnightbookMark />
          <ProjectSwitcher
            name={name}
            currentPath={checkoutPath}
            blockedReason={switchBlockedReason}
            onSwitch={onSwitchProject}
            onOpenFolder={onOpenFolder}
          />
        </div>
        <HeaderSearch onOpen={onOpenSearch} />
        <div className="ps-shell-utilities">
          <SettingsDrawer />
        </div>
      </div>

      <Tabs
        value={view}
        onChange={(next) => next && onViewChange(next as View)}
        variant="unstyled"
        activateTabWithKeyboard={false}
        classNames={{ list: 'ps-shell-tabs', tab: 'ps-shell-tab' }}
      >
        <Tabs.List aria-label="Project views">
          <Tabs.Tab value="board">Board</Tabs.Tab>
          <Tabs.Tab value="documents">Documents</Tabs.Tab>
          <Tabs.Tab value="plans">Plans</Tabs.Tab>
          {/*
           * Set apart at the far end because it is not another way of looking at
           * current work but where finished-with tickets are kept. The count is
           * there because the archive is otherwise invisible: without it, a
           * ticket that left the board looks lost rather than put away.
           */}
          <Tabs.Tab
            value="archive"
            className="ps-shell-tab-archive"
            aria-label={
              archivedCount > 0
                ? `Archive, ${archivedCount} ${archivedCount === 1 ? 'ticket' : 'tickets'}`
                : 'Archive'
            }
            rightSection={
              archivedCount > 0 ? (
                <span className="ps-shell-count" aria-hidden>
                  {archivedCount}
                </span>
              ) : undefined
            }
          >
            Archive
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
    </div>
  )
}

/**
 * A button that opens the search dialog, drawn like a field so it reads as
 * "type here". Below `sm` it folds to its icon; the label stays as the
 * button's accessible name and in a tooltip.
 */
function HeaderSearch({ onOpen }: { onOpen: () => void }) {
  const label = 'Search tickets and documents'
  // Mantine's `sm` breakpoint, where shell.css hides the label.
  const folded = useMediaQuery(`(max-width: ${em(767.9)})`) ?? false
  return (
    <Tooltip label={`${label} (${SEARCH_SHORTCUT_LABEL})`} withArrow disabled={!folded}>
      <UnstyledButton
        className="ps-shell-search ps-shell-control"
        onClick={onOpen}
        aria-label={`${label} (${SEARCH_SHORTCUT_LABEL})`}
      >
        <IconSearch size={15} opacity={0.6} style={{ flexShrink: 0 }} />
        <Text
          size="sm"
          c="var(--ps-text-muted)"
          className="ps-shell-search-label"
          style={{ flex: 1, minWidth: 0 }}
          truncate
        >
          {label}
        </Text>
        <Kbd size="xs" visibleFrom="lg" style={{ flexShrink: 0 }}>
          {SEARCH_SHORTCUT_LABEL}
        </Kbd>
      </UnstyledButton>
    </Tooltip>
  )
}
