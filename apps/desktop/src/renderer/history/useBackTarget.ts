import type { BackTarget } from '../markdown/BackToSource.js'
import type { Screen } from '../projects/screen.js'
import type { History } from './navigation-history.js'

/**
 * The "Back to …" button a document or ticket shows, named for the place one
 * step back. It is the same step as the header's Back, not a separate one, and
 * it appears only when that place was a document or a ticket: a step back to a
 * bare view has nothing to name.
 */
export function useBackTarget(
  screen: Screen,
  navigation: { history: History; goBack: () => void },
): BackTarget | null {
  const { history, goBack } = navigation
  const previous = history.entries[history.index - 1]
  if (!previous || screen.kind !== 'open') return null

  if (previous.ticket) {
    const { id } = previous.ticket
    const ticket =
      screen.project.tickets.find((t) => t.id === id) ??
      screen.project.archivedTickets.find((t) => t.id === id)
    return { label: ticket?.title ?? 'the previous ticket', onBack: goBack }
  }
  if (previous.view === 'documents' && previous.document) {
    return { label: previous.document.path, onBack: goBack }
  }
  return null
}
