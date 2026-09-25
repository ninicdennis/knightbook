import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { IconFileText } from '@tabler/icons-react'
import { Fragment, type ReactNode } from 'react'
import type { SearchHighlight, TicketSearchView } from '../../shared/contract.js'
import type { DocumentSearchHitView } from '../../shared/document-search-contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme/theme.js'
import { TicketTypeBadge } from '../tickets/TicketTypeBadge.js'

/**
 * One row of the header search's results, for a ticket or a document. Both
 * kinds are written by people and AI tools and are equally untrusted, so the
 * matched text is marked up from host-supplied offsets and only ever reaches
 * the DOM as React children.
 */

interface RowProps {
  id: string
  active: boolean
  onHover: () => void
  onOpen: () => void
  heading: ReactNode
  excerpt: string | null
  excerptHighlights: SearchHighlight[]
}

function Row({ id, active, onHover, onOpen, heading, excerpt, excerptHighlights }: RowProps) {
  return (
    <UnstyledButton
      id={id}
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
        {heading}
      </Group>
      {excerpt && (
        <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
          <Marked text={excerpt} highlights={excerptHighlights} />
        </Text>
      )}
    </UnstyledButton>
  )
}

interface HitProps<T> {
  hit: T
  active: boolean
  onHover: () => void
  onOpen: () => void
}

export function TicketHit({ hit, ...row }: HitProps<TicketSearchView['hits'][number]>) {
  return (
    <Row
      id={ticketHitId(hit.id)}
      {...row}
      excerpt={hit.excerpt}
      excerptHighlights={hit.excerptHighlights}
      heading={
        <>
          <Badge
            size="xs"
            variant="light"
            color={STATUS_COLOR[hit.status]}
            style={{ flexShrink: 0 }}
          >
            {STATUS_LABEL[hit.status]}
          </Badge>
          <TicketTypeBadge type={hit.type} size="xs" />
          {/* Labelled, never hidden: a result that is no longer on the board must
              say so, or the reader goes looking for a card that is not there. */}
          {hit.archivedAt && (
            <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>
              Archived
            </Badge>
          )}
          <Text size="sm" fw={600} lineClamp={1}>
            <Marked text={hit.title} highlights={hit.titleHighlights} />
          </Text>
        </>
      }
    />
  )
}

export function DocumentHit({ hit, ...row }: HitProps<DocumentSearchHitView>) {
  return (
    <Row
      id={documentHitId(hit.path)}
      {...row}
      excerpt={hit.excerpt}
      excerptHighlights={hit.excerptHighlights}
      heading={
        <>
          <IconFileText size={14} style={{ flexShrink: 0, alignSelf: 'center' }} aria-hidden />
          <Text size="sm" fw={600} lineClamp={1} style={{ flexShrink: 0, maxWidth: '60%' }}>
            <Marked text={hit.title} highlights={hit.titleHighlights} />
          </Text>
          {/* The path says which of two similarly named documents this is. */}
          <Text size="xs" c="dimmed" truncate="start">
            {hit.path}
          </Text>
        </>
      }
    />
  )
}

export const ticketHitId = (id: string): string => `ticket-search-hit-${id}`
export const documentHitId = (path: string): string =>
  `document-search-hit-${path.replace(/[^A-Za-z0-9_-]/g, '_')}`

/**
 * Renders text with the matched ranges marked. The text is passed as children,
 * never as markup, so content containing HTML or a script tag shows those
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
