import {
  Alert,
  Badge,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { SearchHighlight, TicketSearchView } from '../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'
import { TicketTypeBadge } from './TicketTypeBadge.js'

/**
 * Finding a ticket by what is written in it, including the parts a card never
 * shows: acceptance criteria, notes, and handoffs.
 *
 * The matching is plain, case-insensitive substring matching done in the host.
 * Nothing here is fuzzy or ranked by a score, because a person typing into a
 * board search expects every result to contain what they typed.
 *
 * Ticket text is written by an AI and is exactly as untrusted as a document, so
 * matches are marked up from offsets the host returns rather than from any
 * markup: the text itself only ever reaches the DOM as React children.
 */

/** Long enough to stop a burst of keystrokes, short enough to feel immediate. */
const DEBOUNCE_MS = 120

interface Props {
  opened: boolean
  rootPath: string
  /** Changes when the board is re-read, so an open search reflects the change. */
  refreshToken: number
  onClose: () => void
  onOpenTicket: (id: string) => void
}

export function TicketSearch({ opened, rootPath, refreshToken, onClose, onOpenTicket }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<TicketSearchView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  // Every request carries a number. Only the newest one is allowed to land, so
  // a slow reply for an earlier query cannot overwrite a later answer.
  const latest = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  /** Whatever had focus when search opened, so closing can hand it back. */
  const returnTo = useRef<HTMLElement | null>(null)

  const reset = useCallback(() => {
    latest.current += 1
    setQuery('')
    setResult(null)
    setError(null)
    setLoading(false)
    setActive(0)
  }, [])

  // Opening is a fresh question, and so is switching project underneath it.
  useEffect(() => {
    if (opened) reset()
  }, [opened, rootPath, reset])

  /**
   * Closing puts focus back where it was, whether search was opened from the
   * header or from the keyboard. This is done here rather than left to the
   * dialog's own focus return so the behaviour is the same however it closes,
   * and so it can be tested.
   */
  useEffect(() => {
    if (opened) {
      const active = document.activeElement
      returnTo.current = active instanceof HTMLElement ? active : null
      return
    }

    const target = returnTo.current
    returnTo.current = null
    if (target?.isConnected) target.focus()
  }, [opened])

  useEffect(() => {
    if (!opened) return

    const trimmed = query.trim()
    if (trimmed.length === 0) {
      latest.current += 1
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    const sequence = (latest.current += 1)
    setLoading(true)
    const timer = setTimeout(() => {
      void window.knightbook.searchTickets(rootPath, trimmed).then((answer) => {
        if (sequence !== latest.current) return
        setLoading(false)
        if (!answer.ok) {
          setError(answer.message)
          setResult(null)
          return
        }
        // The host echoes what it answered; a reply about another checkout or
        // another query is not this question's answer.
        if (answer.value.checkoutPath !== rootPath || answer.value.query !== trimmed) return
        setError(null)
        setResult(answer.value)
        setActive(0)
      })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [opened, query, rootPath, refreshToken])

  const hits = result?.hits ?? []

  const move = (delta: number) => {
    if (hits.length === 0) return
    setActive((current) => (current + delta + hits.length) % hits.length)
  }

  // Keep the highlighted row on screen when arrowing past the visible ones.
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]')
    // Guarded because scrolling is a convenience: an environment without it
    // should still show the list rather than fail to render.
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [active, hits.length])

  const open = (id: string) => {
    onClose()
    onOpenTicket(id)
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Search tickets"
      size="lg"
      /* Near the top, because the list grows downwards as you type. */
      yOffset="12vh"
    >
      <Stack gap="sm">
        <TextInput
          data-autofocus
          aria-label="Search tickets"
          aria-controls="ticket-search-results"
          aria-activedescendant={hits[active] ? `ticket-search-hit-${hits[active].id}` : undefined}
          placeholder="Title, acceptance criteria, notes…"
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
            } else if (event.key === 'Enter' && hits[active]) {
              event.preventDefault()
              open(hits[active].id)
            }
          }}
        />

        {error && (
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
            {error} Nothing was changed.
          </Alert>
        )}

        {!error && query.trim().length === 0 && (
          <Text size="sm" c="dimmed">
            Searches ticket titles and everything written in them, in this project only.
          </Text>
        )}

        {!error && query.trim().length > 0 && result && hits.length === 0 && (
          <Text size="sm" c="dimmed">
            No ticket contains “{query.trim()}”.
          </Text>
        )}

        {hits.length > 0 && (
          <Stack
            gap={4}
            ref={listRef}
            id="ticket-search-results"
            // A select/option pair cannot hold a status badge, a marked title
            // and a two-line excerpt, so this is the ARIA listbox pattern the
            // combobox it belongs to expects.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="listbox"
            aria-label="Search results"
            mah="52vh"
            style={{ overflowY: 'auto' }}
          >
            {hits.map((hit, index) => (
              <Hit
                key={hit.id}
                hit={hit}
                active={index === active}
                onHover={() => setActive(index)}
                onOpen={() => open(hit.id)}
              />
            ))}
          </Stack>
        )}

        {result && result.totalMatches > hits.length && (
          <Text size="xs" c="dimmed">
            Showing {hits.length} of {result.totalMatches} matches. Narrow the search to see the
            rest.
          </Text>
        )}

        {/* A ticket that could not be read could not be searched either, and
            that must not look like "no match". */}
        {result && result.unsearchable.length > 0 && (
          <Text size="xs" c="orange">
            {result.unsearchable.length} ticket file
            {result.unsearchable.length === 1 ? '' : 's'} could not be read, so{' '}
            {result.unsearchable.length === 1 ? 'it was' : 'they were'} not searched.
          </Text>
        )}
      </Stack>
    </Modal>
  )
}

function Hit({
  hit,
  active,
  onHover,
  onOpen,
}: {
  hit: TicketSearchView['hits'][number]
  active: boolean
  onHover: () => void
  onOpen: () => void
}) {
  return (
    <UnstyledButton
      id={`ticket-search-hit-${hit.id}`}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="option"
      aria-selected={active}
      data-active={active}
      onMouseEnter={onHover}
      onClick={onOpen}
      p="xs"
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        background: active ? 'var(--mantine-color-default-hover)' : 'transparent',
      }}
    >
      <Group gap="xs" wrap="nowrap" align="baseline">
        <Badge size="xs" variant="light" color={STATUS_COLOR[hit.status]} style={{ flexShrink: 0 }}>
          {STATUS_LABEL[hit.status]}
        </Badge>
        <TicketTypeBadge type={hit.type} size="xs" />
        <Text size="sm" fw={600} lineClamp={1}>
          <Marked text={hit.title} highlights={hit.titleHighlights} />
        </Text>
      </Group>
      {hit.excerpt && (
        <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
          <Marked text={hit.excerpt} highlights={hit.excerptHighlights} />
        </Text>
      )}
    </UnstyledButton>
  )
}

/**
 * Renders text with the matched ranges marked. The text is passed as children,
 * never as markup, so a ticket containing HTML or a script tag shows those
 * characters instead of doing anything.
 */
function Marked({ text, highlights }: { text: string; highlights: SearchHighlight[] }) {
  if (highlights.length === 0) return <>{text}</>

  const parts: { value: string; marked: boolean }[] = []
  let cursor = 0
  for (const range of highlights) {
    if (range.start > cursor) parts.push({ value: text.slice(cursor, range.start), marked: false })
    parts.push({ value: text.slice(range.start, range.start + range.length), marked: true })
    cursor = range.start + range.length
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), marked: false })

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.marked ? (
            <mark style={{ background: 'var(--mantine-color-yellow-light)', color: 'inherit' }}>
              {part.value}
            </mark>
          ) : (
            part.value
          )}
        </Fragment>
      ))}
    </>
  )
}
