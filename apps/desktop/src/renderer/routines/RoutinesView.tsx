import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Code,
  Loader,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle, IconPlus, IconRepeat } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { RoutinesView as RoutinesListing } from '../../shared/routines-contract.js'
import type { LinkRequest } from '../markdown/useLinkNavigation.js'
import { newTicketBody } from '../tickets/new/NewTicketDialog.js'
import { RoutineDetail } from './RoutineDetail.js'
import { NEW_ROUTINE_INSTRUCTIONS, RoutineEditor } from './RoutineEditor.js'
import { formatDay } from './RoutineRuns.js'
import { useRoutineEdits } from './useRoutineEdits.js'

/**
 * The project's routines beside the one being read, laid out like Plans. On a
 * narrow window the list and the routine take turns. Routines are re-read
 * whenever the project refreshes, so a run an AI just started shows up.
 */

interface Props {
  rootPath: string
  refreshToken: number
  onOpenTicket: (id: string) => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  /** Re-reads the project after a run is started, so its ticket is on the board. */
  onRunStarted: () => void
}

const NARROW_QUERY = '(max-width: 47.99em)'

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; listing: RoutinesListing }

function NoRoutines({ onNew }: { onNew: () => void }) {
  return (
    <Center style={{ height: '100%' }}>
      <Stack gap="xs" align="center" maw={440} ta="center">
        <IconRepeat size={28} opacity={0.5} aria-hidden />
        <Text fw={600}>No routines yet</Text>
        <Text size="sm" c="var(--ps-text-muted)">
          A routine is recurring work, such as a weekly package review, kept as instructions. Each
          run becomes a ticket on the board. Create one here, or ask your AI tool to with{' '}
          <Code>routine_create</Code>.
        </Text>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onNew}>
          New routine
        </Button>
      </Stack>
    </Center>
  )
}

export function RoutinesView({
  rootPath,
  refreshToken,
  onOpenTicket,
  onFollowLink,
  onRunStarted,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const narrow = useMediaQuery(NARROW_QUERY) ?? false
  const [pane, setPane] = useState<'list' | 'routine'>('list')
  const [creating, setCreating] = useState(false)
  const edits = useRoutineEdits({
    rootPath,
    show: useCallback((listing: RoutinesListing) => setLoaded({ kind: 'ready', listing }), []),
    reload: useCallback(() => setAttempt((n) => n + 1), []),
    onRunStarted,
  })

  useEffect(() => {
    let cancelled = false
    void window.knightbook.listRoutines(rootPath).then((result) => {
      if (cancelled) return
      // A failed re-read keeps the routines already on screen.
      setLoaded((current) =>
        result.ok
          ? { kind: 'ready', listing: result.value }
          : current.kind === 'ready'
            ? current
            : { kind: 'failed', message: result.message },
      )
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, refreshToken, attempt])

  const choose = useCallback((id: string) => {
    setSelected(id)
    setPane('routine')
  }, [])

  if (loaded.kind === 'loading') {
    return (
      <Center style={{ height: '100%' }}>
        <Loader size="sm" aria-label="Loading routines" />
      </Center>
    )
  }
  if (loaded.kind === 'failed') {
    return (
      <Center style={{ height: '100%' }}>
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="red"
          title="Routines could not be read"
          maw={480}
        >
          <Stack gap="xs">
            <Text size="sm">{loaded.message}</Text>
            <Button size="xs" variant="default" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </Stack>
        </Alert>
      </Center>
    )
  }

  const { routines, problems, unreadableTickets } = loaded.listing
  const newRoutine = creating && (
    <RoutineEditor
      heading="New routine"
      action="Create routine"
      initial={{ title: '', instructions: NEW_ROUTINE_INSTRUCTIONS }}
      saving={edits.busy}
      error={edits.error}
      onClose={() => {
        setCreating(false)
        edits.clearError()
      }}
      onSubmit={(edit) => {
        void edits
          .create({ title: edit.title, instructions: newTicketBody(edit.title, edit.instructions) })
          .then((id) => {
            if (!id) return
            setCreating(false)
            choose(id)
          })
      }}
    />
  )
  const startNew = () => {
    edits.clearError()
    setCreating(true)
  }
  if (routines.length === 0 && problems.length === 0) {
    return (
      <>
        <NoRoutines onNew={startNew} />
        {newRoutine}
      </>
    )
  }

  const current = routines.find((routine) => routine.id === selected) ?? routines[0] ?? null
  const showList = !narrow || pane === 'list'
  const showRoutine = current && (!narrow || pane === 'routine')

  return (
    <div className="ps-docs ps-reading" data-narrow={narrow || undefined}>
      {showList && (
        <nav className="ps-docs-nav" aria-label="Routines">
          <div className="ps-docs-nav-heading" style={{ alignItems: 'center', gap: 6 }}>
            <span>Routines</span>
            <Text span size="xs" c="var(--ps-text-muted)" style={{ marginInlineStart: 'auto' }}>
              {routines.length}
            </Text>
            <Tooltip label="New routine" withinPortal>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="New routine"
                disabled={edits.busy}
                onClick={startNew}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
          <ul className="ps-docs-list">
            {routines.map((routine) => (
              <li key={routine.id}>
                <UnstyledButton
                  className="ps-docs-item"
                  aria-current={routine.id === current?.id ? 'true' : undefined}
                  onClick={() => choose(routine.id)}
                >
                  <span className="ps-docs-item-text">
                    <span className="ps-docs-item-title" style={{ display: 'block' }}>
                      {routine.title}
                    </span>
                    <span className="ps-docs-path" style={{ display: 'block' }}>
                      <span>
                        {routine.openRunIds.length > 0
                          ? 'Run open'
                          : routine.lastCompletedAt
                            ? `Last accepted ${formatDay(routine.lastCompletedAt)}`
                            : routine.runs.length === 0
                              ? 'Never run'
                              : 'No run accepted yet'}
                      </span>
                    </span>
                  </span>
                </UnstyledButton>
              </li>
            ))}
          </ul>
          {problems.length > 0 && (
            <Alert color="orange" variant="light" m="sm" title="Some routines could not be read">
              {problems.map((problem) => (
                <Text key={problem.file} size="xs">
                  {problem.file}: {problem.reason}
                </Text>
              ))}
            </Alert>
          )}
        </nav>
      )}

      {showRoutine && (
        <RoutineDetail
          key={current.id}
          rootPath={rootPath}
          routine={current}
          unreadableTickets={unreadableTickets}
          busy={edits.busy}
          error={creating ? null : edits.error}
          onClearError={edits.clearError}
          onOpenTicket={onOpenTicket}
          onFollowLink={onFollowLink}
          {...(narrow ? { onBack: () => setPane('list') } : {})}
          onSave={(edit) => edits.save(current.id, current.revision, edit)}
          onStartRun={(anotherRun) => void edits.startRun(current.id, anotherRun)}
        />
      )}
      {newRoutine}
    </div>
  )
}
