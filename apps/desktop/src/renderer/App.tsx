import { Alert, AppShell, Button, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type {
  ArchiveOutcome,
  MovableStatus,
  ProjectView,
  RememberedProject,
  Result,
  TicketStatus,
  TicketType,
} from '../shared/contract.js'
import { ArchiveColumnDialog } from './components/ArchiveColumnDialog.js'
import { ArchiveView } from './components/ArchiveView.js'
import { Board } from './components/Board.js'
import { CompletionDialog } from './components/CompletionDialog.js'
import { DocumentsView } from './components/DocumentsView.js'
import { McpStatusFooter } from './components/McpStatusFooter.js'
import { ProjectHeader, type View } from './components/ProjectHeader.js'
import { SetupFolder } from './components/SetupFolder.js'
import { TicketDetailModal } from './components/TicketDetailModal.js'
import { TicketSearch } from './components/TicketSearch.js'
import { isSearchShortcut, isTypingTarget } from './shortcuts.js'
import { VerificationIssueDialog } from './components/VerificationIssueDialog.js'
import { Welcome } from './components/Welcome.js'
import { useRefreshOnFocus } from './hooks/useRefreshOnFocus.js'

/**
 * Every state the board can be in is explicit: nothing open, loading, a folder
 * that is not a project, a project that failed to load, and a project that
 * loaded. Missing data must never be rendered as an empty board.
 */

type Screen =
  | { kind: 'welcome' }
  | { kind: 'loading'; path: string }
  | { kind: 'not-a-project'; path: string }
  | { kind: 'failed'; path: string; code: string; message: string }
  | { kind: 'open'; path: string; project: ProjectView }

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'welcome' })
  const [recentProjects, setRecentProjects] = useState<RememberedProject[]>([])
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingCompletion, setPendingCompletion] = useState<string | null>(null)
  const [confirmOpen, confirm] = useDisclosure(false)
  const [pendingIssue, setPendingIssue] = useState<string | null>(null)
  const [issueOpen, issueDialog] = useDisclosure(false)
  const [searchOpen, search] = useDisclosure(false)
  /*
   * Archiving a column touches many files in sequence, and `busyTicketId` names
   * a single card, so it cannot stand for "a bulk operation is running". Without
   * this the project switcher stays enabled through a bulk archive and could
   * redirect it halfway.
   */
  const [archiving, setArchiving] = useState(false)
  const [pendingArchiveColumn, setPendingArchiveColumn] = useState<TicketStatus | null>(null)
  const [archiveOpen, archiveDialog] = useDisclosure(false)
  const [view, setView] = useState<View>('board')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [documentTarget, setDocumentTarget] = useState<{ path: string; nonce: number } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const load = useCallback(async (path: string) => {
    setScreen({ kind: 'loading', path })
    setActionError(null)
    const result = await window.knightbook.readProject(path)
    if (result.ok) {
      setScreen({ kind: 'open', path, project: result.value })
      void window.knightbook.rememberedProjects().then(setRecentProjects)
    } else {
      setScreen({ kind: 'failed', path, code: result.code, message: result.message })
    }
  }, [])

  /**
   * Reopening the last project on launch matches how the user left the app. A
   * folder that has since moved or become invalid falls through to the failure
   * screen rather than silently showing nothing.
   */
  useEffect(() => {
    void window.knightbook.rememberedProjects().then((recent) => {
      setRecentProjects(recent)
      if (recent[0]) void load(recent[0].path)
    })
  }, [load])

  const choose = useCallback(async () => {
    const chosen = await window.knightbook.chooseProject()
    if (!chosen) return
    if (!chosen.initialized) {
      setScreen({ kind: 'not-a-project', path: chosen.path })
      return
    }
    await load(chosen.path)
  }, [load])

  const openAfterSetup = useCallback(
    async (path: string, warning: string | null) => {
      await load(path)
      // load() clears any standing message, so this has to come after it.
      if (warning) setActionError(warning)
    },
    [load],
  )

  /** Applies a mutation, then replaces the whole view with what the files now say. */
  const apply = useCallback(
    async (ticketId: string, run: () => Promise<Result<ProjectView>>) => {
      if (screen.kind !== 'open') return
      setBusyTicketId(ticketId)
      setActionError(null)

      const result = await run()
      if (result.ok) {
        setScreen({ kind: 'open', path: screen.path, project: result.value })
      } else if (result.code === 'revision_conflict') {
        // Reload first: load() clears any standing message, so the explanation
        // has to be set afterwards or the board would refresh silently.
        await load(screen.path)
        setActionError(
          'That ticket changed somewhere else, so your move was not applied. ' +
            'This is the current version.',
        )
      } else {
        setActionError(result.message)
      }
      setBusyTicketId(null)
    },
    [screen, load],
  )

  /**
   * Archiving reports per-ticket outcomes rather than a single success, because
   * each ticket is its own file and its own write. A partial result is a real
   * answer, not an error: what was archived stays archived, and the rest are
   * named so the user can see which ones to look at.
   */
  const applyArchive = useCallback(
    async (ticketId: string | null, run: () => Promise<Result<ArchiveOutcome>>) => {
      if (screen.kind !== 'open') return
      setBusyTicketId(ticketId)
      setArchiving(true)
      setActionError(null)

      const result = await run()
      if (!result.ok) {
        setActionError(result.message)
        setBusyTicketId(null)
        setArchiving(false)
        return
      }

      const { archivedCount, failures, project } = result.value
      setScreen({ kind: 'open', path: screen.path, project })
      if (failures.length > 0) {
        const names = failures.map((failure) => `"${failure.title}"`).join(', ')
        setActionError(
          `Archived ${archivedCount} of ${archivedCount + failures.length}. ` +
            `${failures.length === 1 ? 'This one was' : 'These were'} left alone because ${
              failures.length === 1 ? 'it' : 'they'
            } changed while you were deciding: ${names}. Nothing was lost; try again.`,
        )
      }
      setBusyTicketId(null)
      setArchiving(false)
    },
    [screen],
  )

  const move = useCallback(
    (ticketId: string, status: MovableStatus) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.setTicketStatus(screen.path, ticketId, status, ticket.revision),
      )
    },
    [screen, apply],
  )

  /**
   * The work type is metadata about the ticket, not a decision about it, so it
   * applies straight away like a move does. The dialog stays open: the user is
   * usually still reading the ticket they just classified.
   */
  const setType = useCallback(
    (ticketId: string, type: TicketType | null) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.setTicketType(screen.path, ticketId, type, ticket.revision),
      )
    },
    [screen, apply],
  )

  /**
   * Manual backlog order. The whole backlog is sent in its new order rather than
   * a single move, so the host writes one list and the window never has to guess
   * what the manifest already held.
   */
  const reorder = useCallback(
    (ticketId: string, to: 'top' | 'up' | 'down') => {
      if (screen.kind !== 'open') return

      const ids = screen.project.tickets
        .filter((candidate) => candidate.status === 'backlog')
        .map((candidate) => candidate.id)
      const from = ids.indexOf(ticketId)
      if (from === -1) return

      const target = to === 'top' ? 0 : to === 'up' ? from - 1 : from + 1
      if (target < 0 || target >= ids.length) return

      const next = [...ids]
      next.splice(from, 1)
      next.splice(target, 0, ticketId)
      void apply(ticketId, () => window.knightbook.reorderBacklog(screen.path, next))
    },
    [screen, apply],
  )

  /**
   * Recording a review is the user confirming they have read the content. It is
   * informational and reversible in effect — a later meaningful edit sets it
   * back — so unlike completion it needs no confirmation step.
   */
  const review = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      void apply(ticketId, () => window.knightbook.recordTicketReview(screen.path, ticketId, ''))
    },
    [screen, apply],
  )

  /**
   * Moving a card into Done records the user's completion decision, so an
   * accidental drag must not be able to do it silently. The confirmation is
   * about the gesture, not a second approval of the work.
   */
  const askToComplete = useCallback(
    (ticketId: string) => {
      setPendingCompletion(ticketId)
      confirm.open()
    },
    [confirm],
  )

  const completeConfirmed = useCallback(() => {
    if (screen.kind !== 'open' || !pendingCompletion) return
    const ticket = screen.project.tickets.find((t) => t.id === pendingCompletion)
    confirm.close()
    if (!ticket) return

    void apply(ticket.id, () =>
      window.knightbook.completeTicket(screen.path, ticket.id, ticket.revision),
    )
    setPendingCompletion(null)
  }, [screen, pendingCompletion, apply, confirm])

  const pendingTicket =
    screen.kind === 'open' && pendingCompletion
      ? screen.project.tickets.find((t) => t.id === pendingCompletion)
      : undefined

  /**
   * Archiving one ticket. Unlike accepting it as done, this records no decision
   * about the work, so it does not need a confirmation of its own: the Archive
   * tab shows exactly what happened and Restore undoes it.
   */
  const archiveOne = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void applyArchive(ticketId, async () => {
        const result = await window.knightbook.archiveTickets(screen.path, [
          { id: ticket.id, revision: ticket.revision },
        ])
        return result
      })
    },
    [screen, applyArchive],
  )

  const restore = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.archivedTickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.restoreTicket(screen.path, ticket.id, ticket.revision),
      )
    },
    [screen, apply],
  )

  /**
   * Archiving a column moves work the user is not inspecting one item at a
   * time, so it always goes through a confirmation that names the column and
   * the exact count.
   */
  const askToArchiveColumn = useCallback(
    (status: TicketStatus) => {
      setPendingArchiveColumn(status)
      archiveDialog.open()
    },
    [archiveDialog],
  )

  const archiveColumnTickets =
    screen.kind === 'open' && pendingArchiveColumn
      ? screen.project.tickets.filter((t) => t.status === pendingArchiveColumn)
      : []

  const archiveColumnConfirmed = useCallback(() => {
    if (screen.kind !== 'open' || !pendingArchiveColumn) return
    /*
     * The set is captured here, from what the board was showing when the user
     * confirmed. A ticket created or changed after that is either absent from
     * this list or refused by revision, so a bulk action can never quietly take
     * something the user never saw.
     */
    const targets = screen.project.tickets
      .filter((t) => t.status === pendingArchiveColumn)
      .map((t) => ({ id: t.id, revision: t.revision }))

    archiveDialog.close()
    setPendingArchiveColumn(null)
    if (targets.length === 0) return

    void applyArchive(null, () => window.knightbook.archiveTickets(screen.path, targets))
  }, [screen, pendingArchiveColumn, archiveDialog, applyArchive])

  /**
   * D-017: recording a failed verification needs the reason, so it always goes
   * through the dialog. Nothing downstream changes; dependents are flagged from
   * this ticket's own record when the board is read back.
   */
  const askAboutIssue = useCallback(
    (ticketId: string) => {
      setPendingIssue(ticketId)
      issueDialog.open()
    },
    [issueDialog],
  )

  const issueConfirmed = useCallback(
    (reason: string) => {
      if (screen.kind !== 'open' || !pendingIssue) return
      const ticket = screen.project.tickets.find((t) => t.id === pendingIssue)
      issueDialog.close()
      if (!ticket) return

      void apply(ticket.id, () =>
        window.knightbook.recordVerificationIssue(screen.path, ticket.id, ticket.revision, reason),
      )
      setPendingIssue(null)
    },
    [screen, pendingIssue, apply, issueDialog],
  )

  /** Clearing the issue un-flags every dependent at once, so it reads back immediately. */
  const resolveIssue = useCallback(
    (ticketId: string) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.knightbook.resolveVerificationIssue(screen.path, ticketId, ticket.revision),
      )
    },
    [screen, apply],
  )

  const pendingIssueTicket =
    screen.kind === 'open' && pendingIssue
      ? screen.project.tickets.find((t) => t.id === pendingIssue)
      : undefined

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
  }, [screen, busyTicketId])

  useRefreshOnFocus(refresh, screen.kind === 'open')

  /**
   * Ctrl/Cmd+K opens search from anywhere in the window. It is deliberately
   * passive about two cases: while the user is typing, because opening a dialog
   * over an unsaved reason or note would lose it and because a formatted editor
   * owns that chord for links; and while another dialog is open, so the chord
   * cannot bury the thing the user is already answering.
   */
  useEffect(() => {
    if (screen.kind !== 'open') return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return
      if (isTypingTarget(event.target) || detailId !== null || confirmOpen || issueOpen) return

      event.preventDefault()
      search.open()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [screen.kind, detailId, confirmOpen, issueOpen, search])

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

  const openDocument = useCallback((path: string) => {
    setDetailId(null)
    setView('documents')
    setDocumentTarget({ path, nonce: Date.now() })
  }, [])

  return (
    <AppShell
      {...(screen.kind === 'open' ? { header: { height: 72 }, footer: { height: 32 } } : {})}
      padding="md"
    >
      {screen.kind === 'open' && (
        <AppShell.Header px="md" py="xs">
          <ProjectHeader
            name={screen.project.name}
            checkoutPath={screen.project.checkoutPath}
            view={view}
            onViewChange={setView}
            archivedCount={screen.project.archivedTickets.length}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            switchBlockedReason={
              archiving
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

        {screen.kind === 'loading' && (
          <Center style={{ height: '100%' }}>
            <Stack align="center" gap="xs">
              <Loader />
              <Text size="sm" c="dimmed">
                Reading project files…
              </Text>
            </Stack>
          </Center>
        )}

        {screen.kind === 'failed' && (
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
                  {screen.path}
                </Text>
                <Text size="sm">{screen.message}</Text>
                <Text size="xs" c="dimmed">
                  Nothing was changed. Your files are exactly as they were.
                </Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => void load(screen.path)}
                  >
                    Try again
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => void choose()}>
                    Open a different folder
                  </Button>
                </Group>
              </Stack>
            </Alert>
          </Center>
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
            {view === 'documents' ? (
              <DocumentsView
                rootPath={screen.path}
                openTarget={documentTarget}
                refreshToken={refreshToken}
              />
            ) : view === 'archive' ? (
              <ArchiveView
                tickets={screen.project.archivedTickets}
                busyTicketId={busyTicketId}
                onOpen={setDetailId}
                onRestore={restore}
              />
            ) : (
              <Board
                project={screen.project}
                busyTicketId={busyTicketId}
                onMove={move}
                onComplete={askToComplete}
                onReorder={reorder}
                onReportIssue={askAboutIssue}
                onResolveIssue={resolveIssue}
                onReview={review}
                onOpen={setDetailId}
                onArchive={archiveOne}
                onArchiveColumn={askToArchiveColumn}
              />
            )}
          </Stack>
        )}
      </AppShell.Main>

      {screen.kind === 'open' && (
        <AppShell.Footer>
          <McpStatusFooter checkoutPath={screen.project.checkoutPath} />
        </AppShell.Footer>
      )}

      {screen.kind === 'open' && detailTicket && (
        <TicketDetailModal
          rootPath={screen.path}
          ticket={detailTicket}
          isNext={screen.project.nextTicketId === detailTicket.id}
          onClose={() => setDetailId(null)}
          // Moving or completing hands off to the board's own flow, which shows
          // the result, so the dialog gets out of the way first.
          onMove={(status) => {
            setDetailId(null)
            move(detailTicket.id, status)
          }}
          onSetType={(type) => setType(detailTicket.id, type)}
          onComplete={() => {
            setDetailId(null)
            askToComplete(detailTicket.id)
          }}
          onReportIssue={() => {
            setDetailId(null)
            askAboutIssue(detailTicket.id)
          }}
          onResolveIssue={() => resolveIssue(detailTicket.id)}
          onReview={() => review(detailTicket.id)}
          onOpenDocument={openDocument}
        />
      )}

      <ArchiveColumnDialog
        opened={archiveOpen}
        status={pendingArchiveColumn}
        tickets={archiveColumnTickets}
        onClose={archiveDialog.close}
        onConfirm={archiveColumnConfirmed}
      />

      <CompletionDialog
        opened={confirmOpen}
        ticket={pendingTicket}
        onClose={confirm.close}
        onConfirm={completeConfirmed}
      />

      <VerificationIssueDialog
        opened={issueOpen}
        ticket={pendingIssueTicket}
        onClose={issueDialog.close}
        onConfirm={issueConfirmed}
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
          onOpenTicket={setDetailId}
        />
      )}
    </AppShell>
  )
}
