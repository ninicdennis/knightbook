import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconEye,
  IconFileText,
  IconUserCheck,
} from '@tabler/icons-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  MovableStatus,
  TicketDetailView,
  TicketView,
} from '../../shared/contract.js'
import { renderMarkdown } from '../markdown.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'
import { MarkdownBody } from './MarkdownBody.js'
import { ReviewBadge } from './ReviewBadge.js'

/**
 * Everything written on one ticket. The specification asks the app to let a
 * person read what an AI wrote, and until this existed the only way was to open
 * the Markdown file by hand.
 *
 * The board's copy of the ticket renders straight away, so the header and the
 * actions never wait; the body and the resolved dependencies arrive from a fresh
 * read. The body goes through the same sanitizer as the document viewer, because
 * a ticket is written by an AI and is exactly as untrusted as a document.
 */

const MOVABLE: MovableStatus[] = ['backlog', 'in_progress', 'verification']

interface Props {
  rootPath: string
  ticket: TicketView
  isNext: boolean
  onClose: () => void
  onMove: (status: MovableStatus) => void
  onComplete: () => void
  onReview: () => void
  onOpenDocument: (path: string) => void
}

export function TicketDetailModal({
  rootPath,
  ticket,
  isNext,
  onClose,
  onMove,
  onComplete,
  onReview,
  onOpenDocument,
}: Props) {
  const [detail, setDetail] = useState<TicketDetailView | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Re-read whenever the board says this ticket changed, including a review
  // recorded from this very dialog.
  const version = `${ticket.revision}|${ticket.review.state}|${ticket.review.lastReviewedAt ?? ''}`

  useEffect(() => {
    let cancelled = false
    setError(null)
    void window.projectspace.readTicket(rootPath, ticket.id).then((result) => {
      if (cancelled) return
      if (result.ok) setDetail(result.value)
      else {
        setDetail(null)
        setError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, ticket.id, version])

  const rendered = useMemo(
    () => (detail ? renderMarkdown(detail.body, 'ticket.md') : null),
    [detail],
  )

  return (
    <Modal opened onClose={onClose} title={ticket.title} size="xl" centered scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="md">
        <Group gap="xs">
          <Badge variant="light" color={STATUS_COLOR[ticket.status]}>
            {STATUS_LABEL[ticket.status]}
          </Badge>
          {isNext && (
            <Badge variant="light" color="accent">
              Next up
            </Badge>
          )}
          <ReviewBadge review={ticket.review} />
        </Group>

        {ticket.blocker && (
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="Blocked">
            {ticket.blocker}
          </Alert>
        )}

        {ticket.completionUnattributed && (
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="Unattributed">
            This was set to Done outside the app, with no recorded decision. Nothing here shows who
            accepted it.
          </Alert>
        )}

        {ticket.completion && <CompletionRecord completion={ticket.completion} />}

        {error && (
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="Could not read this ticket">
            {error} Nothing was changed.
          </Alert>
        )}

        {!detail && !error && (
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Reading the ticket…
            </Text>
          </Group>
        )}

        {detail && rendered && (
          <>
            <Dependencies ticket={ticket} detail={detail} />

            <Divider />
            <MarkdownBody compact html={rendered.html} onFollowLink={onOpenDocument} />

            {detail.relatedDocuments.length > 0 && (
              <Section title="Related documents">
                <Group gap={4}>
                  {detail.relatedDocuments.map((path) => (
                    <Button
                      key={path}
                      variant="subtle"
                      size="compact-sm"
                      leftSection={<IconFileText size={14} />}
                      onClick={() => onOpenDocument(path)}
                    >
                      {path}
                    </Button>
                  ))}
                </Group>
              </Section>
            )}

            <Text size="xs" c="dimmed">
              Created {formatWhen(detail.createdAt)} · Updated {formatWhen(detail.updatedAt)} ·
              Revision {detail.revision.slice(0, 8)}
              {ticket.review.lastReviewedAt && ` · Last reviewed ${formatWhen(ticket.review.lastReviewedAt)}`}
            </Text>
          </>
        )}

        <Divider />
        <Group justify="space-between">
          <Menu position="top-start" withinPortal>
            <Menu.Target>
              <Button variant="default" size="xs" leftSection={<IconArrowsExchange size={14} />}>
                Move to
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {MOVABLE.filter((status) => status !== ticket.status).map((status) => (
                <Menu.Item key={status} onClick={() => onMove(status)}>
                  {STATUS_LABEL[status]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Group gap="xs">
            {ticket.review.state !== 'reviewed' && (
              <Button variant="default" size="xs" leftSection={<IconEye size={14} />} onClick={onReview}>
                {ticket.review.state === 'changed_since_review'
                  ? 'Mark reviewed again'
                  : 'Mark content reviewed'}
              </Button>
            )}
            {ticket.status === 'verification' && (
              <Button color="teal" size="xs" leftSection={<IconUserCheck size={14} />} onClick={onComplete}>
                Accept as done
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function Dependencies({ ticket, detail }: { ticket: TicketView; detail: TicketDetailView }) {
  if (detail.dependencies.length === 0) return null

  const cannotStart = ticket.status === 'backlog' && !ticket.dependencyReady

  return (
    <Section title="Depends on">
      {detail.dependencies.map((dependency) => (
        <Group key={dependency.id} gap="xs" wrap="nowrap" align="baseline">
          <Badge
            size="xs"
            variant="light"
            color={dependency.status ? STATUS_COLOR[dependency.status] : 'red'}
          >
            {dependency.status ? STATUS_LABEL[dependency.status] : 'Missing'}
          </Badge>
          <Text size="sm">{dependency.title ?? `No ticket with id ${dependency.id}`}</Text>
          <Text size="xs" c="dimmed">
            {dependency.status === null
              ? 'is missing from this project'
              : dependency.satisfied
                ? 'satisfies this dependency'
                : 'is not ready yet'}
          </Text>
        </Group>
      ))}
      <Text size="xs" c="dimmed">
        A prerequisite in Verification or Done lets this ticket start. That does not mean it has
        been accepted.
      </Text>
      {cannotStart && ticket.dependencyNotes.length > 0 && (
        <Text size="xs" c="orange">
          {ticket.dependencyNotes.join('; ')}
        </Text>
      )}
    </Section>
  )
}

function CompletionRecord({ completion }: { completion: NonNullable<TicketView['completion']> }) {
  const byAgent = completion.recordedBy === 'agent'

  return (
    <Section title="Completion record">
      <Text size="sm">
        {byAgent ? 'Recorded by an AI tool on your instruction' : 'Accepted by you in the app'} ·{' '}
        {formatWhen(completion.recordedAt)}
      </Text>
      <Text size="sm" c="dimmed">
        &ldquo;{completion.instruction}&rdquo;
      </Text>
      {byAgent && (
        <Text size="xs" c="dimmed">
          You told the AI this was complete and it recorded your decision; it did not decide this
          itself.
        </Text>
      )}
    </Section>
  )
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}
