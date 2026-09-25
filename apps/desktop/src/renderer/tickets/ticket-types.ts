import type { TicketType } from '../../shared/contract.js'

/**
 * How a work type is shown. The record stores the word; the emoji is chosen
 * here, so a ticket file stays plain text that another tool or an external
 * editor can read without knowing anything about this app.
 *
 * The emoji is decoration for scanning, never the meaning: the word is always
 * beside it, and nothing distinguishes the types by colour alone. Task uses a
 * tool rather than a tick, because a checkmark next to a ticket would read as
 * "done" — which is a status, not a kind of work.
 */

/** The order the selector offers them in: the two common ones, the specific kinds, then the catch-all. */
export const TICKET_TYPES: TicketType[] = ['feature', 'bug', 'research', 'documentation', 'task']

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  task: 'Task',
  research: 'Research',
  documentation: 'Documentation',
}

export const TICKET_TYPE_EMOJI: Record<TicketType, string> = {
  feature: '✨',
  bug: '🐛',
  task: '🛠️',
  research: '🔎',
  documentation: '📝',
}

/** Said in full where there is room for it, so the word is never the only clue. */
export const TICKET_TYPE_MEANING: Record<TicketType, string> = {
  feature: 'New or expanded capability.',
  bug: 'Existing behaviour that is wrong.',
  task: 'Maintenance or other general work.',
  research: 'Investigation, comparison, or evidence gathering.',
  documentation: 'Creating, improving, or maintaining written guides and reference.',
}
