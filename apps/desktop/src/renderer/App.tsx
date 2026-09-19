import {
  Alert,
  AppShell,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { MovableStatus, ProjectView, Result } from '../shared/contract.js'
import { Board } from './components/Board.js'
import { DocumentsView } from './components/DocumentsView.js'
import { ProjectHeader } from './components/ProjectHeader.js'
import { Welcome } from './components/Welcome.js'

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
  const [recentProjects, setRecentProjects] = useState<string[]>([])
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingCompletion, setPendingCompletion] = useState<string | null>(null)
  const [confirmOpen, confirm] = useDisclosure(false)
  const [view, setView] = useState<'board' | 'documents'>('board')

  const load = useCallback(async (path: string) => {
    setScreen({ kind: 'loading', path })
    setActionError(null)
    const result = await window.projectspace.readProject(path)
    if (result.ok) {
      setScreen({ kind: 'open', path, project: result.value })
      void window.projectspace.recentProjects().then(setRecentProjects)
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
    void window.projectspace.recentProjects().then((recent) => {
      setRecentProjects(recent)
      if (recent[0]) void load(recent[0])
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

  return (
    <AppShell {...(screen.kind === 'open' ? { header: { height: 72 } } : {})} padding="md">
      {screen.kind === 'open' && (
        <AppShell.Header px="md" py="xs">
          <ProjectHeader
            name={screen.project.name}
            checkoutPath={screen.project.checkoutPath}
            view={view}
            onViewChange={setView}
            onOpenAnother={() => void choose()}
          />
        </AppShell.Header>
      )}

      <AppShell.Main style={{ height: '100vh' }}>
        {screen.kind === 'welcome' && (
          <Welcome
            recentProjects={recentProjects}
            notAProject={null}
            onChoose={() => void choose()}
            onOpenRecent={(path) => void load(path)}
          />
        )}

        {screen.kind === 'not-a-project' && (
          <Welcome
            recentProjects={recentProjects}
            notAProject={screen.path}
            onChoose={() => void choose()}
            onOpenRecent={(path) => void load(path)}
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

        {screen.kind === 'open' && view === 'documents' && (
          <DocumentsView rootPath={screen.path} />
        )}

        {screen.kind === 'open' && view === 'board' && (
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
            <Board
              project={screen.project}
              busyTicketId={busyTicketId}
              onMove={move}
              onComplete={askToComplete}
              onReview={review}
            />
          </Stack>
        )}
      </AppShell.Main>

      <Modal opened={confirmOpen} onClose={confirm.close} title="Accept this as done?" centered>
        <Stack gap="md">
          <Text size="sm">{pendingTicket?.title}</Text>
          <Text size="sm" c="dimmed">
            This records that you accepted the work. It is saved as your own decision, separately
            from anything an AI tool reported.
          </Text>
          {pendingTicket && pendingTicket.status !== 'verification' && (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
              This ticket is in {pendingTicket.status.replace('_', ' ')}, not Verification. The
              change will be refused.
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={confirm.close}>
              Cancel
            </Button>
            <Button color="teal" onClick={completeConfirmed}>
              Accept as done
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  )
}
