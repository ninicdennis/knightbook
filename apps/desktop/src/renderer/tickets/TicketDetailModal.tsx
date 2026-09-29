import { Box, Group, Modal, Stack } from '@mantine/core'
import { useMemo, useState } from 'react'
import type {
  MovableStatus,
  ProjectView,
  Result,
  TicketType,
  TicketView,
} from '../../shared/contract.js'
import type { TicketContentEdit, TicketLinksEdit } from '../../shared/ticket-edit-contract.js'
import type { LinkRequest, ScrollTarget } from '../markdown/useLinkNavigation.js'
import { useReviewChanges } from '../review/useReviewChanges.js'
import { renderMarkdown } from '../markdown/markdown.js'
import { MarkdownBody } from '../markdown/MarkdownBody.js'
import type { BackTarget } from '../markdown/BackToSource.js'
import { ReadingModeSwitch, ReviewChanges, type ReadingMode } from '../review/ReviewChanges.js'
import { TicketBlocker } from './TicketBlocker.js'
import { TicketDetailActions, type EditTarget } from './TicketDetailActions.js'
import { TicketDetailHeader } from './TicketDetailHeader.js'
import { TicketSourceEditor, TicketSourceEditorActions } from './TicketSourceEditor.js'
import { TicketLinksEditor } from './TicketLinksEditor.js'
import { useReturnFocusToCard } from './useReturnFocusToCard.js'
import { useTicketDetail } from './useTicketDetail.js'
import { useTicketSourceEdit } from './useTicketSourceEdit.js'
import { TicketDetailNotices } from './TicketDetailNotices.js'
import {
  AuditDetails,
  Dependencies,
  PlanMemberships,
  RelatedDocuments,
  ReopenedRecord,
} from './TicketDetailSections.js'

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
  /** Records why the ticket cannot move; null clears it. */
  onSetBlocker: (blocker: string | null) => void
  /** Saves an edited title and body against the revision the editor read. */
  onSaveContent: (content: TicketContentEdit, revision: string) => Promise<Result<ProjectView>>
  /** Saves the prerequisites and related documents against the revision the editor read. */
  onSaveLinks: (links: TicketLinksEdit, revision: string) => Promise<Result<ProjectView>>
  /** The board's tickets, offered as prerequisites. */
  tickets: TicketView[]
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
  /** Shows a plan this ticket belongs to, in the Plans tab. */
  onOpenPlan: (planId: string) => void
}

export function TicketDetailModal({
  rootPath,
  ticket,
  isNext,
  onClose,
  onMove,
  onSetType,
  onSetBlocker,
  onSaveContent,
  onSaveLinks,
  tickets,
  onComplete,
  onReportIssue,
  onResolveIssue,
  onReview,
  onFollowLink,
  scrollTo = null,
  back = null,
  onOpenPlan,
}: Props) {
  const { detail, error } = useTicketDetail(rootPath, ticket)
  const edit = useTicketSourceEdit(onSaveContent)
  const [chosenMode, setMode] = useState<ReadingMode>('read')
  // Never-reviewed content has nothing to compare against, so it only reads.
  const canCompare = ticket.review.state !== 'unreviewed'
  const mode: ReadingMode = canCompare ? chosenMode : 'read'
  const [editingLinks, setEditingLinks] = useState(false)
  const [editingBlocker, setEditingBlocker] = useState(false)
  useReturnFocusToCard(ticket.id)

  /** The footer's Edit menu opens each editor where its content is shown. */
  const openEditor = (target: EditTarget): void => {
    if (target === 'blocker') setEditingBlocker(true)
    else if (target === 'links') setEditingLinks(true)
    else if (detail) {
      setMode('read')
      edit.start({ title: detail.title, body: detail.body, revision: detail.revision })
    }
  }

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
    <Modal.Root
      opened
      // Escape, the close button and a click outside all ask before losing a draft.
      onClose={() => edit.leave('close', onClose)}
      size="xl"
      centered
      padding="lg"
      returnFocus={false}
    >
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
        {/* Going back would leave the ticket, so it waits until the edit is saved or cancelled. */}
        <TicketDetailHeader
          ticket={ticket}
          isNext={isNext}
          back={edit.editing ? null : back}
          rootPath={rootPath}
        />

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
          {edit.editing ? (
            <TicketSourceEditor edit={edit} />
          ) : (
            <Stack gap="lg">
              <TicketBlocker
                blocker={ticket.blocker}
                onSave={onSetBlocker}
                editing={editingBlocker}
                onEditingChange={setEditingBlocker}
              />

              <TicketDetailNotices ticket={ticket} error={error} loading={!detail && !error} />

              {detail && rendered && (
                <>
                  <Dependencies ticket={ticket} detail={detail} />
                  {editingLinks && (
                    <TicketLinksEditor
                      rootPath={rootPath}
                      ticket={ticket}
                      detail={detail}
                      candidates={tickets}
                      onSave={onSaveLinks}
                      onDone={() => setEditingLinks(false)}
                    />
                  )}
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

                  {/* Structured related documents are project-relative, not body-relative. */}
                  <RelatedDocuments
                    paths={detail.relatedDocuments}
                    onOpen={(path) => onFollowLink({ path, fragment: null })}
                  />
                  <PlanMemberships plans={detail.plans} onOpen={onOpenPlan} />
                  <ReopenedRecord previous={detail.previousCompletions} />
                  <AuditDetails detail={detail} lastReviewedAt={ticket.review.lastReviewedAt} />
                </>
              )}
            </Stack>
          )}
        </Modal.Body>

        <Box
          style={{
            borderTop: '1px solid var(--ps-hairline)',
            padding: 'var(--mantine-spacing-md) var(--mantine-spacing-lg)',
          }}
        >
          {/* While editing, only the editor's controls show: a move or a type change would
              close the dialog or change the revision the draft is saved against. */}
          {edit.editing ? (
            <TicketSourceEditorActions edit={edit} onClose={onClose} />
          ) : (
            <TicketDetailActions
              ticket={ticket}
              onMove={onMove}
              onSetType={onSetType}
              onComplete={onComplete}
              onReportIssue={onReportIssue}
              onResolveIssue={onResolveIssue}
              onReview={() => shownRevision && onReview(shownRevision)}
              canReview={shownRevision !== null}
              onEdit={openEditor}
              // One draft at a time: opening the text editor would drop the links draft.
              editable={{ content: detail !== null && !editingLinks, links: detail !== null }}
            />
          )}
        </Box>
      </Modal.Content>
    </Modal.Root>
  )
}
