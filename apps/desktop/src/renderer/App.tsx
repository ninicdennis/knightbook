import { Alert, AppShell, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { ArchiveColumnDialog } from './components/ArchiveColumnDialog.js'
import { ArchiveView } from './components/ArchiveView.js'
import { Board } from './components/Board.js'
import { CompletionDialog } from './components/CompletionDialog.js'
import { DocumentsView } from './components/DocumentsView.js'
import { PlansView } from './components/PlansView.js'
import { McpStatusFooter } from './components/McpStatusFooter.js'
import { NewTicketDialog } from './components/NewTicketDialog.js'
import { ProjectHeader, type View } from './components/ProjectHeader.js'
import { LoadingProject, ProjectLoadFailed } from './components/ProjectStatusScreens.js'
import { SetupFolder } from './components/SetupFolder.js'
import { TicketDetailModal } from './components/TicketDetailModal.js'
import { TicketSearch } from './components/TicketSearch.js'
import { VerificationIssueDialog } from './components/VerificationIssueDialog.js'
import { Welcome } from './components/Welcome.js'
import { useArchiveActions } from './hooks/useArchiveActions.js'
import { useNewTicket } from './hooks/useNewTicket.js'
import { useLinkNavigation, type LinkPlace, type ScrollTarget } from './hooks/useLinkNavigation.js'
import { useProjectScreen } from './hooks/useProjectScreen.js'
import { useRefreshOnFocus } from './hooks/useRefreshOnFocus.js'
import { useSearchShortcut } from './hooks/useSearchShortcut.js'
import { useTicketActions } from './hooks/useTicketActions.js'
import { useWindowTitle } from './hooks/useWindowTitle.js'

/**
 * Below `md` the header reflows onto two rows (shell.css). AppShell offsets the
 * main area by this height rather than measuring the header, so the two
 * breakpoints must match.
 */
const HEADER_HEIGHT = { base: 104, md: 60 }

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

  const [searchOpen, search] = useDisclosure(false)
  const [view, setView] = useState<View>('board')
  const [detailId, setDetailId] = useState<string | null>(null)
  /** A heading the open ticket should show, when a link named one. */
  const [detailScroll, setDetailScroll] = useState<ScrollTarget | null>(null)
  const [documentTarget, setDocumentTarget] = useState<{
    path: string
    nonce: number
    scrollTo: ScrollTarget | null
  } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  /**
   * Re-reads the project without the loading screen, so the user keeps their
   * place. A failure keeps the last version that loaded and says so, rather than
   * swapping the board for an error page.
   */
  const refresh = useCallback(async () => {
    if (screen.kind !== 'open' || busyTicketId !== null) return
    const path = screen.path
    setRefreshing(true)

    const result = await window.knightbook.readProject(path)
    if (result.ok) {
      // The user may have switched projects while this was reading.
      setScreen((current) =>
        current.kind === 'open' && current.path === path
          ? { kind: 'open', path, project: result.value }
          : current,
      )
      setRefreshToken((n) => n + 1)
    } else {
      setActionError(
        `Could not refresh: ${result.message} What is shown is the last version that loaded.`,
      )
    }
    setRefreshing(false)
  }, [screen, busyTicketId, setScreen, setActionError])

  useRefreshOnFocus(refresh, screen.kind === 'open')

  const openTicket = useCallback((id: string, scrollTo: ScrollTarget | null = null) => {
    setDetailId(id)
    setDetailScroll(scrollTo)
  }, [])
  const newTicket = useNewTicket(controls, openTicket)

  useSearchShortcut(
    screen.kind === 'open',
    detailId !== null || actions.completion.opened || actions.issue.opened || newTicket.opened,
    search.open,
  )

  /*
   * Both lists: an archived ticket is still a readable record, and the Archive
   * tab opens it. Looking only at the board would make a row there open nothing
   * at all, because the effect below would immediately close it again.
   */
  const detailTicket =
    screen.kind === 'open' && detailId
      ? (screen.project.tickets.find((t) => t.id === detailId) ??
        screen.project.archivedTickets.find((t) => t.id === detailId))
      : undefined

  // A ticket can vanish between refreshes; close its dialog rather than leave it
  // ready to reappear on its own.
  useEffect(() => {
    if (detailId && !detailTicket) setDetailId(null)
  }, [detailId, detailTicket])

  const switchProject = useCallback(
    (path: string) => {
      if (screen.kind === 'open' && screen.path === path) return
      setView('board')
      setDetailId(null)
      setDocumentTarget(null)
      void load(path)
    },
    [screen, load],
  )

  const openDocument = useCallback((path: string, scrollTo: ScrollTarget | null = null) => {
    setDetailId(null)
    setView('documents')
    setDocumentTarget({ path, nonce: Date.now(), scrollTo })
  }, [])

  const [planTarget, setPlanTarget] = useState<{ id: string; nonce: number } | null>(null)
  const openPlan = useCallback((id: string) => {
    setDetailId(null)
    setView('plans')
    setPlanTarget({ id, nonce: Date.now() })
  }, [])

  const links = useLinkNavigation({
    rootPath: screen.kind === 'open' ? screen.path : null,
    openDocument,
    openTicket,
  })
  const backAction = (place: LinkPlace | null) =>
    place && {
      label: place.kind === 'ticket' ? place.title : place.path,
      onBack: () => links.goBack(place),
    }

  return (
    <AppShell
      {...(screen.kind === 'open'
        ? { header: { height: HEADER_HEIGHT }, footer: { height: 32 } }
        : {})}
      padding="md"
    >
      {screen.kind === 'open' && (
        <AppShell.Header className="ps-shell-chrome" px="md" py="xs">
          <ProjectHeader
            name={screen.project.name}
            checkoutPath={screen.project.checkoutPath}
            view={view}
            onViewChange={setView}
            archivedCount={screen.project.archivedTickets.length}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            switchBlockedReason={
              archive.archiving
                ? 'Tickets are being archived. Switching is available once that finishes.'
                : busyTicketId !== null
                  ? 'A ticket is being updated. Switching is available once that finishes.'
                  : null
            }
            onSwitchProject={switchProject}
            onOpenFolder={() => void choose()}
            onOpenSearch={search.open}
          />
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
              {view === 'documents' ? (
                <DocumentsView
                  rootPath={screen.path}
                  openTarget={documentTarget}
                  refreshToken={refreshToken}
                  onFollowLink={(path, request) =>
                    links.follow({ kind: 'document', path }, request)
                  }
                  backFor={(path) => backAction(links.backFrom({ kind: 'document', path }))}
                />
              ) : view === 'plans' ? (
                <PlansView
                  rootPath={screen.path}
                  openTarget={planTarget}
                  refreshToken={refreshToken}
                  onOpenTicket={openTicket}
                  onFollowLink={(request) => links.follow(null, request)}
                />
              ) : view === 'archive' ? (
                <ArchiveView
                  tickets={screen.project.archivedTickets}
                  busyTicketId={busyTicketId}
                  onOpen={openTicket}
                  onRestore={actions.restore}
                />
              ) : (
                <Board
                  project={screen.project}
                  busyTicketId={busyTicketId}
                  onMove={actions.move}
                  onComplete={actions.askToComplete}
                  onReorder={actions.reorder}
                  onReportIssue={actions.askAboutIssue}
                  onResolveIssue={actions.resolveIssue}
                  onReview={actions.review}
                  onOpen={openTicket}
                  onArchive={archive.archiveOne}
                  onArchiveColumn={archive.askToArchiveColumn}
                  onNewTicket={newTicket.open}
                />
              )}
            </div>
          </Stack>
        )}
      </AppShell.Main>

      {screen.kind === 'open' && (
        <AppShell.Footer className="ps-shell-chrome">
          <McpStatusFooter checkoutPath={screen.project.checkoutPath} />
        </AppShell.Footer>
      )}

      {screen.kind === 'open' && detailTicket && (
        <TicketDetailModal
          // A link from one ticket to another starts the dialog afresh.
          key={detailTicket.id}
          rootPath={screen.path}
          ticket={detailTicket}
          isNext={screen.project.nextTicketId === detailTicket.id}
          onClose={() => setDetailId(null)}
          // Moving or completing hands off to the board's own flow, which shows
          // the result, so the dialog gets out of the way first.
          onMove={(status) => {
            setDetailId(null)
            actions.move(detailTicket.id, status)
          }}
          onSetType={(type) => actions.setType(detailTicket.id, type)}
          onComplete={() => {
            setDetailId(null)
            actions.askToComplete(detailTicket.id)
          }}
          onReportIssue={() => {
            setDetailId(null)
            actions.askAboutIssue(detailTicket.id)
          }}
          onResolveIssue={() => actions.resolveIssue(detailTicket.id)}
          onReview={(revision) => actions.review(detailTicket.id, revision)}
          onOpenPlan={openPlan}
          onFollowLink={(request) =>
            links.follow(
              { kind: 'ticket', id: detailTicket.id, title: detailTicket.title },
              request,
            )
          }
          scrollTo={detailScroll}
          back={backAction(links.backFrom({ kind: 'ticket', id: detailTicket.id }))}
        />
      )}

      <ArchiveColumnDialog
        opened={archive.archiveColumn.opened}
        status={archive.archiveColumn.status}
        tickets={archive.archiveColumn.tickets}
        onClose={archive.archiveColumn.close}
        onConfirm={archive.archiveColumn.confirm}
      />

      <NewTicketDialog
        opened={newTicket.opened}
        saving={newTicket.saving}
        error={newTicket.error}
        onClose={newTicket.close}
        onCreate={newTicket.create}
      />

      <CompletionDialog
        opened={actions.completion.opened}
        ticket={actions.completion.ticket}
        onClose={actions.completion.close}
        onConfirm={actions.completion.confirm}
      />

      <VerificationIssueDialog
        opened={actions.issue.opened}
        ticket={actions.issue.ticket}
        onClose={actions.issue.close}
        onConfirm={actions.issue.confirm}
      />

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
        />
      )}
    </AppShell>
  )
}
