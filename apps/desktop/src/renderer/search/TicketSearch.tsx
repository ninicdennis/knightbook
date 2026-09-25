import { Alert, Loader, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { SearchScope } from '../../shared/ticket-search-contract.js'
import { useHeaderSearch } from './useHeaderSearch.js'
import { DocumentHit, TicketHit, documentHitId, ticketHitId } from './SearchHits.js'

/**
 * Finding a ticket or a document by what is written in it, including the parts
 * a card never shows: acceptance criteria, notes, and handoffs.
 *
 * The matching is plain, case-insensitive substring matching done in the host.
 * Nothing here is fuzzy or ranked by a score, because a person typing into a
 * search expects every result to contain what they typed. Results come in two
 * groups, each with its own empty and failed state, so "no documents matched"
 * never looks like "documents could not be searched".
 */

interface Props {
  opened: boolean
  rootPath: string
  /** Changes when the board is re-read, so an open search reflects the change. */
  refreshToken: number
  onClose: () => void
  onOpenTicket: (id: string) => void
  onOpenDocument: (path: string) => void
  /** The scope the Archive tab wants when search is opened from there. */
  defaultScope?: SearchScope
}

type Item = { kind: 'ticket'; id: string } | { kind: 'document'; path: string }

export function TicketSearch({
  opened,
  rootPath,
  refreshToken,
  onClose,
  onOpenTicket,
  onOpenDocument,
  defaultScope = 'active',
}: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [scope, setScope] = useState<SearchScope>(defaultScope)
  const { tickets, documents, loading } = useHeaderSearch({
    opened,
    rootPath,
    query,
    scope,
    refreshToken,
  })

  const listRef = useRef<HTMLDivElement>(null)
  /** Whatever had focus when search opened, so closing can hand it back. */
  const returnTo = useRef<HTMLElement | null>(null)

  const reset = useCallback(() => {
    setQuery('')
    setActive(0)
    // Back to the scope this was opened for, so searching from the Archive tab
    // starts in the archive again rather than remembering the last search.
    setScope(defaultScope)
  }, [defaultScope])

  // Opening is a fresh question, and so is switching project underneath it.
  useEffect(() => {
    if (opened) reset()
  }, [opened, rootPath, reset])

  /**
   * Closing puts focus back where it was, whether search was opened from the
   * header or from the keyboard. Done here rather than left to the dialog's
   * own focus return so the behaviour is the same however it closes.
   */
  useEffect(() => {
    if (opened) {
      const current = document.activeElement
      returnTo.current = current instanceof HTMLElement ? current : null
      return
    }
    const target = returnTo.current
    returnTo.current = null
    if (target?.isConnected) target.focus()
  }, [opened])

  const ticketHits = tickets.view?.hits ?? []
  const documentHits = documents.view?.hits ?? []
  // One list for the keyboard, tickets first, in the order they are shown.
  const items: Item[] = [
    ...ticketHits.map((hit): Item => ({ kind: 'ticket', id: hit.id })),
    ...documentHits.map((hit): Item => ({ kind: 'document', path: hit.path })),
  ]

  useEffect(() => setActive(0), [tickets.view, documents.view])

  const move = (delta: number) => {
    if (items.length === 0) return
    setActive((current) => (current + delta + items.length) % items.length)
  }

  // Keep the highlighted row on screen when arrowing past the visible ones.
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]')
    // Guarded because scrolling is a convenience: an environment without it
    // should still show the list rather than fail to render.
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [active, items.length])

  const open = (item: Item) => {
    onClose()
    if (item.kind === 'ticket') onOpenTicket(item.id)
    else onOpenDocument(item.path)
  }

  const trimmed = query.trim()
  const highlighted = items[active]
  const activeId = !highlighted
    ? undefined
    : highlighted.kind === 'ticket'
      ? ticketHitId(highlighted.id)
      : documentHitId(highlighted.path)
  const answered = tickets.view || tickets.error || documents.view || documents.error

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Search tickets and documents"
      size="lg"
      /* Near the top, because the list grows downwards as you type. */
      yOffset="12vh"
      /*
       * A column down to the results, so the list is the only part that
       * shrinks and scrolls. A fixed cap on the list could add up to more
       * than the dialog's own maximum height and give it a second scrollbar.
       */
      styles={{
        content: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
        body: { display: 'flex', flexDirection: 'column', minHeight: 0 },
      }}
    >
      <Stack gap="sm" className="ps-search-column" style={{ minHeight: 0 }}>
        <TextInput
          data-autofocus
          aria-label="Search tickets and documents"
          aria-controls="ticket-search-results"
          aria-activedescendant={activeId}
          placeholder="Title, acceptance criteria, notes, document text…"
          leftSection={<IconSearch size={16} />}
          rightSection={loading ? <Loader size="xs" /> : null}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Enter' && highlighted) {
              event.preventDefault()
              open(highlighted)
            }
          }}
        />

        {/* Archived tickets stay findable, but they are not usually what someone
            searching the board means, so the scope is explicit rather than a
            silent default the reader has to infer from the results. */}
        <SegmentedControl
          size="xs"
          value={scope}
          onChange={(next) => setScope(next as SearchScope)}
          data={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
            { value: 'all', label: 'All' },
          ]}
        />

        {trimmed.length === 0 && (
          <Text size="sm" c="dimmed">
            Searches ticket titles and everything written in them, and the documents in this
            workspace, in this project only.
          </Text>
        )}

        {trimmed.length > 0 && answered && (
          <Stack
            gap="sm"
            ref={listRef}
            id="ticket-search-results"
            // A select/option pair cannot hold a status badge, a marked title
            // and a two-line excerpt, so this is the ARIA listbox pattern the
            // combobox it belongs to expects.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="listbox"
            aria-label="Search results"
            style={{ position: 'relative', minHeight: 0, overflowY: 'auto' }}
          >
            <ResultGroup
              label="Tickets"
              error={tickets.error}
              empty={tickets.view !== null && ticketHits.length === 0}
              emptyText={`No ticket contains “${trimmed}”.`}
              shown={ticketHits.length}
              total={tickets.view?.totalMatches ?? 0}
              unsearchable={tickets.view?.unsearchable.length ?? 0}
              noun="ticket file"
            >
              {ticketHits.map((hit, index) => (
                <TicketHit
                  key={hit.id}
                  hit={hit}
                  active={index === active}
                  onHover={() => setActive(index)}
                  onOpen={() => open({ kind: 'ticket', id: hit.id })}
                />
              ))}
            </ResultGroup>

            {scope === 'archived' ? (
              <Text size="xs" c="dimmed">
                Documents are never archived, so they are searched under Active and All.
              </Text>
            ) : (
              <ResultGroup
                label="Documents"
                error={documents.error}
                empty={documents.view !== null && documentHits.length === 0}
                emptyText={`No document contains “${trimmed}”.`}
                shown={documentHits.length}
                total={documents.view?.totalMatches ?? 0}
                unsearchable={documents.view?.unsearchable.length ?? 0}
                noun="document"
              >
                {documentHits.map((hit, index) => (
                  <DocumentHit
                    key={hit.path}
                    hit={hit}
                    active={ticketHits.length + index === active}
                    onHover={() => setActive(ticketHits.length + index)}
                    onOpen={() => open({ kind: 'document', path: hit.path })}
                  />
                ))}
              </ResultGroup>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  )
}

interface GroupProps {
  label: string
  error: string | null
  empty: boolean
  emptyText: string
  shown: number
  total: number
  /** Files that could not be read, so could not be searched: never "no match". */
  unsearchable: number
  noun: string
  children: ReactNode
}

function ResultGroup(props: GroupProps) {
  const { label, error, empty, emptyText, shown, total, unsearchable, noun, children } = props
  const headingId = `search-group-${label.toLowerCase()}`
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <Stack gap={4} role="group" aria-labelledby={headingId}>
      <Text id={headingId} size="xs" fw={700} tt="uppercase" c="dimmed">
        {label}
      </Text>
      {error ? (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
          {label} could not be searched: {error} Nothing was changed.
        </Alert>
      ) : empty ? (
        <Text size="sm" c="dimmed">
          {emptyText}
        </Text>
      ) : (
        children
      )}
      {total > shown && (
        <Text size="xs" c="dimmed">
          Showing {shown} of {total} matches. Narrow the search to see the rest.
        </Text>
      )}
      {unsearchable > 0 && (
        <Text size="xs" c="orange">
          {unsearchable} {noun}
          {unsearchable === 1 ? '' : 's'} could not be read, so{' '}
          {unsearchable === 1 ? 'it was' : 'they were'} not searched.
        </Text>
      )}
    </Stack>
  )
}
