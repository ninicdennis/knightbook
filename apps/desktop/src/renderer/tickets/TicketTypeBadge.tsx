import { Badge, Tooltip, VisuallyHidden } from '@mantine/core'
import type { TicketType } from '../../shared/contract.js'
import { TICKET_TYPE_EMOJI, TICKET_TYPE_LABEL, TICKET_TYPE_MEANING } from './ticket-types.js'

/**
 * What kind of work a ticket is. Untyped renders nothing at all: a ticket with
 * no type is not a fourth kind of work, and a placeholder badge would put a
 * mark on every old record that nobody has classified.
 *
 * It is the quietest badge on a card on purpose. Status, blocked work and
 * "Next up" all say something about whether the work can move; a type only
 * says what the work is, so it must not outrank any of them.
 */
export function TicketTypeBadge({ type, size = 'sm' }: { type: TicketType | null; size?: string }) {
  if (!type) return null

  return (
    <Tooltip withArrow label={`${TICKET_TYPE_LABEL[type]}: ${TICKET_TYPE_MEANING[type]}`}>
      <Badge size={size} variant="default" style={{ flexShrink: 0 }}>
        {/*
         * The emoji is hidden from assistive technology because the word next to
         * it already carries the meaning, and "sparkles Feature" would only be
         * noise. The prefix is what makes "Feature" unambiguous when the badge
         * is read on its own, away from the card around it.
         */}
        <VisuallyHidden>Type: </VisuallyHidden>
        <span aria-hidden="true">{TICKET_TYPE_EMOJI[type]} </span>
        {TICKET_TYPE_LABEL[type]}
      </Badge>
    </Tooltip>
  )
}
