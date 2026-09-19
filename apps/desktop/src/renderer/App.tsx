import { Alert, AppShell, Button, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { MovableStatus, ProjectView, RememberedProject, Result } from '../shared/contract.js'
import { Board } from './components/Board.js'
import { CompletionDialog } from './components/CompletionDialog.js'
import { DocumentsView } from './components/DocumentsView.js'
import { ProjectHeader } from './components/ProjectHeader.js'
import { SetupFolder } from './components/SetupFolder.js'
import { TicketDetailModal } from './components/TicketDetailModal.js'
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
  const [view, setView] = useState<'board' | 'documents'>('board')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [documentTarget, setDocumentTarget] = useState<{ path: string; nonce: number } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const load = useCallback(async (path: string) => {
    setScreen({ kind: 'loading', path })
    setActionError(null)
    const result = await window.projectspace.readProject(path)
    if (result.ok) {
      setScreen({ kind: 'open', path, project: result.value })
      void window.projectspace.rememberedProjects().then(setRecentProjects)
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
    void window.projectspace.rememberedProjects().then((recent) => {
      setRecentProjects(recent)
      if (recent[0]) void load(recent[0].path)
    })
  }, [load])

  const choose = useCallback(async () => {
    const chosen = await window.projectspace.chooseProject()
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

  const move = useCallback(
    (ticketId: string, status: MovableStatus) => {
      if (screen.kind !== 'open') return
      const ticket = screen.project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      void apply(ticketId, () =>
        window.projectspace.setTicketStatus(screen.path, ticketId, status, ticket.revision),
      )
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
      void apply(ticketId, () => window.projectspace.recordTicketReview(screen.path, ticketId, ''))
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
      window.projectspace.completeTicket(screen.path, ticket.id, ticket.revision),
    )
    setPendingCompletion(null)
  }, [screen, pendingCompletion, apply, confirm])

  const pendingTicket =
    screen.kind === 'open' && pendingCompletion
      ? screen.project.tickets.find((t) => t.id === pendingCompletion)
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

    const result = await window.projectspace.readProject(path)
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

  const detailTicket =
    screen.kind === 'open' && detailId
      ? screen.project.tickets.find((t) => t.id === detailId)
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
    <AppShell {...(screen.kind === 'open' ? { header: { height: 72 } } : {})} padding="md">
      {screen.kind === 'open' && (
        <AppShell.Header px="md" py="xs">
          <ProjectHeader
            name={screen.project.name}
            checkoutPath={screen.project.checkoutPath}
            view={view}
            onViewChange={setView}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            switchBlockedReason={
              busyTicketId !== null
                ? 'A ticket is being updated. Switching is available once that finishes.'
                : null
            }
            onSwitchProject={switchProject}
            onOpenFolder={() => void choose()}
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
            ) : (
              <Board
                project={screen.project}
                busyTicketId={busyTicketId}
                onMove={move}
                onComplete={askToComplete}
                onReview={review}
                onOpen={setDetailId}
              />
            )}
          </Stack>
        )}
      </AppShell.Main>

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
          onComplete={() => {
            setDetailId(null)
            askToComplete(detailTicket.id)
          }}
          onReview={() => review(detailTicket.id)}
          onOpenDocument={openDocument}
        />
      )}

      <CompletionDialog
        opened={confirmOpen}
        ticket={pendingTicket}
        onClose={confirm.close}
        onConfirm={completeConfirmed}
      />
    </AppShell>
  )
}
