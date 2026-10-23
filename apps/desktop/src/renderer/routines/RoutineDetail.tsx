import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft, IconPencil, IconPlayerPlay } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { RoutineEdit, RoutineView } from '../../shared/routines-contract.js'
import type { LinkRequest } from '../markdown/useLinkNavigation.js'
import { renderMarkdown } from '../markdown/markdown.js'
import { MarkdownBody } from '../markdown/MarkdownBody.js'
import { STATUS_LABEL } from '../theme/theme.js'
import { RoutineEditor } from './RoutineEditor.js'
import { formatDay, RoutineRuns } from './RoutineRuns.js'

/**
 * One routine: its instructions, a way to start the next run, and its runs.
 * While a run is open, starting another asks first and offers the open one,
 * so a second ticket is only ever made on purpose.
 */

interface Props {
  rootPath: string
  routine: RoutineView
  unreadableTickets: number
  busy: boolean
  /** The last write's failure, shown in the editor while it is open and above the routine otherwise. */
  error: string | null
  onClearError: () => void
  onOpenTicket: (id: string) => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  /** Shown on a narrow window, where the list and the routine take turns. */
  onBack?: () => void
  onSave: (edit: RoutineEdit) => Promise<boolean>
  onStartRun: (anotherRun: boolean) => void
}

export function RoutineDetail({
  rootPath,
  routine,
  unreadableTickets,
  busy,
  error,
  onClearError,
  onOpenTicket,
  onFollowLink,
  onBack,
  onSave,
  onStartRun,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rendered = useMemo(
    () => renderMarkdown(routine.instructions, routine.file),
    [routine.instructions, routine.file],
  )
  const openRun = routine.runs.find((run) => routine.openRunIds.includes(run.ticketId)) ?? null

  return (
    <section className="ps-docs-reader" aria-labelledby="routine-title">
      <div className="ps-docs-toolbar">
        <div className="ps-docs-toolbar-identity">
          {onBack && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={14} />}
              onClick={onBack}
            >
              All routines
            </Button>
          )}
          <Stack gap={2} style={{ minWidth: 0 }}>
            <h2 id="routine-title" className="ps-docs-title">
              {routine.title}
            </h2>
            <span className="ps-docs-reader-path">{routine.file}</span>
          </Stack>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPencil size={14} />}
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            size="xs"
            leftSection={<IconPlayerPlay size={14} />}
            disabled={busy}
            onClick={() => (openRun ? setConfirming(true) : onStartRun(false))}
          >
            Start run
          </Button>
        </Group>
      </div>

      <div className="ps-docs-body">
        <Stack gap="lg">
          {error && !editing && (
            <Alert
              color="orange"
              variant="light"
              withCloseButton
              onClose={onClearError}
              icon={<IconAlertTriangle size={16} />}
            >
              {error}
            </Alert>
          )}
          {openRun && (
            <Text size="sm">
              A run is open: started {formatDay(openRun.startedAt)}, now{' '}
              {STATUS_LABEL[openRun.status]}.{' '}
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => onOpenTicket(openRun.ticketId)}
              >
                Open it
              </Button>
            </Text>
          )}
          <MarkdownBody html={rendered.html} rootPath={rootPath} onFollowLink={onFollowLink} />
          <RoutineRuns
            routine={routine}
            unreadableTickets={unreadableTickets}
            onOpen={onOpenTicket}
          />
        </Stack>
      </div>

      {editing && (
        <RoutineEditor
          heading="Edit routine"
          action="Save"
          initial={{ title: routine.title, instructions: routine.instructions }}
          note="Markdown. Runs already started keep the instructions they began with."
          saving={busy}
          error={error}
          onClose={() => {
            setEditing(false)
            onClearError()
          }}
          onSubmit={(edit) => {
            void onSave(edit).then((saved) => saved && setEditing(false))
          }}
        />
      )}
      {confirming && openRun && (
        <Modal opened onClose={() => setConfirming(false)} title="Start another run?" centered>
          <Stack gap="md">
            <Text size="sm">
              This routine already has an open run, started {formatDay(openRun.startedAt)} and now{' '}
              {STATUS_LABEL[openRun.status]}. Starting another makes a second ticket beside it.
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                onClick={() => {
                  setConfirming(false)
                  onOpenTicket(openRun.ticketId)
                }}
              >
                Open the current run
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false)
                  onStartRun(true)
                }}
              >
                Start another run
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </section>
  )
}
