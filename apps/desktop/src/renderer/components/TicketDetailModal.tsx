import { Alert, Badge, Box, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MovableStatus,
  TicketDetailView,
  TicketType,
  TicketView,
} from '../../shared/contract.js'
import { renderMarkdown } from '../markdown.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'
import { MarkdownBody } from './MarkdownBody.js'
import { ReviewBadge } from './ReviewBadge.js'
import { TicketDetailActions } from './TicketDetailActions.js'
import { TicketTypeBadge } from './TicketTypeBadge.js'
import {
  AuditDetails,
  CompletionRecord,
  Dependencies,
  RelatedDocuments,
  ReopenedRecord,
} from './TicketDetailSections.js'
import { VerificationIssueNotice } from './VerificationIssueNotice.js'

/**
 * Everything written on one ticket. The specification asks the app to let a
 * person read what an AI wrote, and until this existed the only way was to open
 * the Markdown file by hand.
 *
 * The dialog is three fixed parts: a header that names the ticket, one region
 * that scrolls, and an action bar. Only the middle part scrolls, so a ticket
 * with a long body cannot bury its own controls — reading to the end used to be
 * the only way to reach them. The dialog's height comes from the modal's own
 * bound on the window, not from a subtracted header height, so nothing here has
 * to be corrected when the header wraps or the text size changes.
 *
 * The board's copy of the ticket renders straight away, so the header and the
 * actions never wait; the body and the resolved dependencies arrive from a fresh
 * read. The body goes through the same sanitizer as the document viewer, because
 * a ticket is written by an AI and is exactly as untrusted as a document.
 */

interface Props {
  rootPath: string
  ticket: TicketView
  isNext: boolean
  onClose: () => void
  onMove: (status: MovableStatus) => void
  onSetType: (type: TicketType | null) => void
  onComplete: () => void
  /** D-017: the user says this did not pass verification, and why. */
  onReportIssue: () => void
  onResolveIssue: () => void
  onReview: () => void
  onOpenDocument: (path: string) => void
}

export function TicketDetailModal({
  rootPath,
  ticket,
  isNext,
  onClose,
  onMove,
  onSetType,
  onComplete,
  onReportIssue,
  onResolveIssue,
  onReview,
  onOpenDocument,
}: Props) {
  const [detail, setDetail] = useState<TicketDetailView | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Whatever had focus when the dialog opened, as a fallback for closing. */
  const returnTo = useRef<HTMLElement | null>(null)

  // Re-read whenever the board says this ticket changed, including a review
  // recorded from this very dialog.
  const version = `${ticket.revision}|${ticket.review.state}|${ticket.review.lastReviewedAt ?? ''}`

  useEffect(() => {
    let cancelled = false
    setError(null)
    void window.knightbook.readTicket(rootPath, ticket.id).then((result) => {
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

  /*
   * Closing hands focus back to the card this ticket was opened from, whichever
   * way it was opened: clicking a card leaves focus on the document body, and a
   * result opened from search belongs to a dialog that has already closed, so
   * the modal's own focus return has nothing useful to give back. The card's own
   * control is a real target in both cases. Done here rather than left to
   * Mantine so the behaviour is the same however the dialog closes.
   */
  useEffect(() => {
    const opener = document.activeElement
    returnTo.current = opener instanceof HTMLElement ? opener : null

    return () => {
      const card = document.querySelector<HTMLElement>(`[data-ticket-handle="${ticket.id}"]`)
      const target = card ?? returnTo.current
      if (target?.isConnected) target.focus()
    }
  }, [ticket.id])

  const rendered = useMemo(
    () => (detail ? renderMarkdown(detail.body, 'ticket.md') : null),
    [detail],
  )

  return (
    /* `lg` padding rather than the default: the reading text, the badges and the
       action bar were all sitting too close to the dialog's edges. */
    <Modal.Root opened onClose={onClose} size="xl" centered padding="lg" returnFocus={false}>
      <Modal.Overlay />
      {/*
       * A column, so the body below can be the only part that scrolls. The zero
       * minimum keeps the dialog at its own width: without it a single long
       * path or identifier inside would widen the whole dialog rather than wrap.
       */}
      <Modal.Content
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
      >
        <Modal.Header
          style={{
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--ps-hairline)',
          }}
        >
          <Stack gap={8} style={{ flex: 1, minWidth: 0 }}>
            <Modal.Title
              style={{ fontSize: 'var(--mantine-font-size-xl)', fontWeight: 600, lineHeight: 1.3 }}
            >
              {ticket.title}
            </Modal.Title>
            {/* Secondary to the title, and never allowed to push Close aside. */}
            <Group gap="xs" wrap="wrap">
              <Badge size="sm" variant="light" color={STATUS_COLOR[ticket.status]}>
                {STATUS_LABEL[ticket.status]}
              </Badge>
              <TicketTypeBadge type={ticket.type} />
              {isNext && (
                <Badge size="sm" variant="light" color="accent">
                  Next up
                </Badge>
              )}
              <ReviewBadge review={ticket.review} />
            </Group>
          </Stack>
          <Modal.CloseButton aria-label="Close" style={{ flexShrink: 0 }} />
        </Modal.Header>

        {/*
         * Mantine drops the body's top padding when a header sits above it, which
         * left the first line of the ticket against the header rule. It is put
         * back here so the reading area has room on all four sides.
         */}
        <Modal.Body
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingTop: 'var(--mantine-spacing-lg)',
          }}
        >
          <Stack gap="lg">
            {ticket.blocker && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="orange"
                variant="light"
                title="Blocked"
              >
                {ticket.blocker}
              </Alert>
            )}

            <VerificationIssueNotice ticket={ticket} />

            {ticket.completionUnattributed && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="orange"
                variant="light"
                title="Unattributed"
              >
                This was set to Done outside the app, with no recorded decision from the app or an
                AI tool. Nothing here shows who accepted it.
              </Alert>
            )}

            {ticket.completion && <CompletionRecord completion={ticket.completion} />}

            {error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="orange"
                variant="light"
                title="Could not read this ticket"
              >
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
                {/*
                 * The reading region. It is deliberately one element holding only
                 * the ticket's own prose, so a formatted editor and its toolbar
                 * can take this space later without touching the header, the
                 * action bar, or how the dialog scrolls.
                 */}
                <MarkdownBody compact html={rendered.html} onFollowLink={onOpenDocument} />

                <RelatedDocuments paths={detail.relatedDocuments} onOpen={onOpenDocument} />
                <ReopenedRecord previous={detail.previousCompletions} />
                <AuditDetails detail={detail} lastReviewedAt={ticket.review.lastReviewedAt} />
              </>
            )}
          </Stack>
        </Modal.Body>

        <Box
          style={{
            borderTop: '1px solid var(--ps-hairline)',
            padding: 'var(--mantine-spacing-md) var(--mantine-spacing-lg)',
          }}
        >
          <TicketDetailActions
            ticket={ticket}
            onMove={onMove}
            onSetType={onSetType}
            onComplete={onComplete}
            onReportIssue={onReportIssue}
            onResolveIssue={onResolveIssue}
            onReview={onReview}
          />
        </Box>
      </Modal.Content>
    </Modal.Root>
  )
}
