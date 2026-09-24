import { Alert, Box, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MovableStatus,
  TicketDetailView,
  TicketType,
  TicketView,
} from '../../shared/contract.js'
import type { LinkRequest, ScrollTarget } from '../hooks/useLinkNavigation.js'
import { useReviewChanges } from '../hooks/useReviewChanges.js'
import { renderMarkdown } from '../markdown.js'
import { MarkdownBody } from './MarkdownBody.js'
import type { BackTarget } from './BackToSource.js'
import { ReadingModeSwitch, ReviewChanges, type ReadingMode } from './ReviewChanges.js'
import { TicketDetailActions } from './TicketDetailActions.js'
import { TicketDetailHeader } from './TicketDetailHeader.js'
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
  /** Records the user's review of exactly the revision this dialog showed them. */
  onReview: (revision: string) => void
  /** Follows a link or related document; resolves to a failure message, or null. */
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  /** A heading to show, when a link to this ticket named one. */
  scrollTo?: ScrollTarget | null
  /** Back to where the link that opened this ticket was followed from. */
  back?: BackTarget | null
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
  onFollowLink,
  scrollTo = null,
  back = null,
}: Props) {
  const [detail, setDetail] = useState<TicketDetailView | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Why a related-document button did not open anything. */
  const [relatedNotice, setRelatedNotice] = useState<string | null>(null)
  const [chosenMode, setMode] = useState<ReadingMode>('read')
  // Never-reviewed content has nothing to compare against, so it only reads.
  const canCompare = ticket.review.state !== 'unreviewed'
  const mode: ReadingMode = canCompare ? chosenMode : 'read'
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
    // Links resolve from where the ticket file really is, so `../../docs/x.md`
    // written in a ticket reaches docs/x.md as it would in any editor.
    () => (detail ? renderMarkdown(detail.body, `.projectspace/tickets/${detail.id}.md`) : null),
    [detail],
  )

  // Changes compares the whole ticket file, frontmatter included, against the
  // last review; it is reloaded whenever the board sees a new revision.
  const changes = useReviewChanges(
    rootPath,
    mode === 'changes' ? { kind: 'ticket', id: ticket.id } : null,
    ticket.revision,
  )
  const shownRevision =
    mode === 'read'
      ? (detail?.revision ?? null)
      : changes.load.status === 'ready'
        ? changes.load.view.currentRevision
        : null

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
        className="ps-reading"
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
      >
        <TicketDetailHeader ticket={ticket} isNext={isNext} back={back} />

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
                {canCompare && (
                  <Group justify="flex-end">
                    <ReadingModeSwitch mode={mode} onChange={setMode} />
                  </Group>
                )}
                {/*
                 * The reading region. It is deliberately one element holding only
                 * the ticket's own prose, so a formatted editor and its toolbar
                 * can take this space later without touching the header, the
                 * action bar, or how the dialog scrolls.
                 */}
                {mode === 'read' ? (
                  <MarkdownBody
                    compact
                    html={rendered.html}
                    onFollowLink={onFollowLink}
                    scrollTo={scrollTo}
                  />
                ) : (
                  <ReviewChanges
                    load={changes.load}
                    heldRevision={ticket.revision}
                    onReload={changes.reload}
                  />
                )}

                {relatedNotice && (
                  <Alert
                    icon={<IconAlertTriangle size={16} />}
                    color="orange"
                    variant="light"
                    withCloseButton
                    closeButtonLabel="Dismiss"
                    onClose={() => setRelatedNotice(null)}
                  >
                    {relatedNotice}
                  </Alert>
                )}
                {/* Structured related documents are project-relative, not body-relative. */}
                <RelatedDocuments
                  paths={detail.relatedDocuments}
                  onOpen={(path) =>
                    void onFollowLink({ path, fragment: null }).then(setRelatedNotice)
                  }
                />
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
            onReview={() => shownRevision && onReview(shownRevision)}
            canReview={shownRevision !== null}
          />
        </Box>
      </Modal.Content>
    </Modal.Root>
  )
}
