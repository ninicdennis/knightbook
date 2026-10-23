import { Alert, AppShell, Group, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useState } from 'react'
import { ProjectDialogs } from './app/ProjectDialogs.js'
import { ProjectHeader } from './app/ProjectHeader.js'
import { RefreshControl } from './app/RefreshControl.js'
import { TitleStrip } from './app/TitleBar.js'
import { LoadingProject, ProjectLoadFailed } from './projects/ProjectStatusScreens.js'
import { ProjectViewSwitch } from './app/ProjectViewSwitch.js'
import { SetupFolder } from './projects/SetupFolder.js'
import { Welcome } from './projects/Welcome.js'
import { useProjectNavigation } from './app/useProjectNavigation.js'
import { useProjectRefresh } from './app/useProjectRefresh.js'
import { useProjectScreen } from './projects/useProjectScreen.js'
import { useWindowTitle } from './app/useWindowTitle.js'
import { useArchiveActions } from './board/useArchiveActions.js'
import { useBackTarget } from './history/useBackTarget.js'
import { useHistoryInput } from './history/useHistoryInput.js'
import { useLinkNavigation } from './markdown/useLinkNavigation.js'
import { McpStatusFooter } from './mcp/McpStatusFooter.js'
import { TicketSearch } from './search/TicketSearch.js'
import { useSearchShortcut } from './search/useSearchShortcut.js'
import { TicketDetailModal } from './tickets/detail/TicketDetailModal.js'
import { useNewTicket } from './tickets/new/useNewTicket.js'
import { useTicketActions } from './tickets/useTicketActions.js'

/**
 * Two rows at every width (shell.css): 48px for project, search and settings,
 * 40px for the view tabs, and the 1px hairline. AppShell offsets the main area
 * by this height rather than measuring the header, so they must agree.
 */
const HEADER_HEIGHT = 89

/** Every other screen still needs a title bar to drag the window by (D-030). */
const TITLE_STRIP_HEIGHT = 48

/**
 * The window's root: which screen is showing, which view of an open project,
 * and which ticket or dialog is open over it. What happens to tickets lives in
 * the action hooks; this only wires them to what is on screen.
 */
export function App() {
  const {
    screen,
    setScreen,
    recentProjects,
    actionError,
    setActionError,
    load,
    choose,
    openAfterSetup,
  } = useProjectScreen()
  useWindowTitle(screen)
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null)
  const controls = { screen, setScreen, load, setActionError, setBusyTicketId }
  const actions = useTicketActions(controls)
  const archive = useArchiveActions(controls)
  const { refresh, refreshing, refreshToken } = useProjectRefresh({
    screen,
    setScreen,
    setActionError,
    busyTicketId,
  })

  const navigation = useProjectNavigation(screen, load, setActionError)
  const { view, detailTicket, openTicket, closeTicket } = navigation
  const newTicket = useNewTicket(controls, openTicket)

  const [searchOpen, search] = useDisclosure(false)
  useSearchShortcut(
    screen.kind === 'open',
    navigation.detailId !== null ||
      actions.completion.opened ||
      actions.issue.opened ||
      newTicket.opened,
    search.open,
  )

  const links = useLinkNavigation({
    rootPath: screen.kind === 'open' ? screen.path : null,
    openDocument: navigation.openDocument,
    openTicket,
  })
  useHistoryInput(screen.kind === 'open', navigation.goBack, navigation.goForward)
  const backTarget = useBackTarget(screen, navigation)

  return (
    <AppShell
      {...(screen.kind === 'open'
        ? { header: { height: HEADER_HEIGHT }, footer: { height: 32 } }
        : { header: { height: TITLE_STRIP_HEIGHT } })}
      padding="md"
    >
      {screen.kind === 'open' && (
        <AppShell.Header className="ps-shell-chrome" px="md">
          <ProjectHeader
            name={screen.project.name}
            checkoutPath={screen.project.checkoutPath}
            view={view}
            onViewChange={navigation.setView}
            archivedCount={screen.project.archivedTickets.length}
            switchBlockedReason={
              archive.archiving
                ? 'Tickets are being archived. Switching is available once that finishes.'
                : busyTicketId !== null
                  ? 'A ticket is being updated. Switching is available once that finishes.'
                  : null
            }
            onSwitchProject={navigation.switchProject}
            onOpenFolder={() => void choose()}
            onOpenSearch={search.open}
            history={{
              canGoBack: navigation.canGoBack,
              canGoForward: navigation.canGoForward,
              onBack: navigation.goBack,
              onForward: navigation.goForward,
            }}
          />
        </AppShell.Header>
      )}

      {screen.kind !== 'open' && (
        <AppShell.Header className="ps-shell-chrome" px="md" withBorder={false}>
          <TitleStrip />
        </AppShell.Header>
      )}

      <AppShell.Main style={{ height: '100vh' }}>
        {screen.kind === 'welcome' && (
          <Welcome
            recentProjects={recentProjects}
            onChoose={() => void choose()}
            onOpenRecent={(path) => void load(path)}
          />
        )}

        {screen.kind === 'not-a-project' && (
          <SetupFolder
            path={screen.path}
            onSetUp={openAfterSetup}
            onChooseAnother={() => void choose()}
          />
        )}

        {screen.kind === 'loading' && <LoadingProject />}

        {screen.kind === 'failed' && (
          <ProjectLoadFailed
            path={screen.path}
            message={screen.message}
            onRetry={() => void load(screen.path)}
            onChooseAnother={() => void choose()}
          />
        )}

        {screen.kind === 'open' && (
          <Stack gap="sm" style={{ height: '100%' }}>
            {actionError && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="orange"
                variant="light"
                withCloseButton
                onClose={() => setActionError(null)}
              >
                {actionError}
              </Alert>
            )}
            {/* The view gets what is left under an alert, not the whole height,
                so its own scrolling regions still end inside the window. */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ProjectViewSwitch
                rootPath={screen.path}
                project={screen.project}
                busyTicketId={busyTicketId}
                refreshToken={refreshToken}
                navigation={navigation}
                links={links}
                backTarget={backTarget}
                actions={actions}
                archive={archive}
                onNewTicket={newTicket.open}
                onProjectChanged={() => void refresh()}
              />
            </div>
          </Stack>
        )}
      </AppShell.Main>

      {screen.kind === 'open' && (
        <AppShell.Footer className="ps-shell-chrome">
          <Group h="100%" justify="space-between" wrap="nowrap" pe="xs">
            <McpStatusFooter checkoutPath={screen.project.checkoutPath} />
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          </Group>
        </AppShell.Footer>
      )}

      {screen.kind === 'open' && detailTicket && (
        <TicketDetailModal
          // A link from one ticket to another starts the dialog afresh.
          key={detailTicket.id}
          rootPath={screen.path}
          ticket={detailTicket}
          isNext={screen.project.nextTicketId === detailTicket.id}
          onClose={closeTicket}
          // Moving or completing hands off to the board's own flow, which shows
          // the result, so the dialog gets out of the way first.
          onMove={(status) => {
            closeTicket()
            actions.move(detailTicket.id, status)
          }}
          onSetType={(type) => actions.setType(detailTicket.id, type)}
          onSetBlocker={(blocker) => actions.setBlocker(detailTicket.id, blocker)}
          onSaveContent={(content, revision) =>
            actions.editContent(detailTicket.id, content, revision)
          }
          onSaveLinks={(links, revision) => actions.editLinks(detailTicket.id, links, revision)}
          tickets={screen.project.tickets}
          onComplete={() => {
            closeTicket()
            actions.askToComplete(detailTicket.id)
          }}
          onReportIssue={() => {
            closeTicket()
            actions.askAboutIssue(detailTicket.id)
          }}
          onResolveIssue={() => actions.resolveIssue(detailTicket.id)}
          onReview={(revision) => actions.review(detailTicket.id, revision)}
          onOpenPlan={navigation.openPlan}
          onFollowLink={links.follow}
          scrollTo={navigation.detailScroll}
          back={backTarget}
        />
      )}

      <ProjectDialogs actions={actions} archive={archive} newTicket={newTicket} />

      {screen.kind === 'open' && (
        <TicketSearch
          opened={searchOpen}
          rootPath={screen.path}
          refreshToken={refreshToken}
          onClose={search.close}
          // Searching from the Archive looks in the archive. Anywhere else, the
          // board is what the user is looking at and so what they mean.
          defaultScope={view === 'archive' ? 'archived' : 'active'}
          // Opening a result shows the ticket wherever the user was, because
          // the detail view is not part of either the board or the documents.
          onOpenTicket={openTicket}
          onOpenDocument={navigation.openDocument}
        />
      )}
    </AppShell>
  )
}
