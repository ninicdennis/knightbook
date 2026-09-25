import type { Dispatch, SetStateAction } from 'react'
import type { ProjectView } from '../../shared/contract.js'

/**
 * Every state the board can be in is explicit: nothing open, loading, a folder
 * that is not a project, a project that failed to load, and a project that
 * loaded. Missing data must never be rendered as an empty board.
 */
export type Screen =
  | { kind: 'welcome' }
  | { kind: 'loading'; path: string }
  | { kind: 'not-a-project'; path: string }
  | { kind: 'failed'; path: string; code: string; message: string }
  | { kind: 'open'; path: string; project: ProjectView }

/**
 * What the ticket-action hooks need from the window: the open project, a way to
 * replace it with what the files now say, and the two pieces of feedback every
 * action shares — which card is busy, and the message above the board.
 */
export interface ScreenControls {
  readonly screen: Screen
  readonly setScreen: Dispatch<SetStateAction<Screen>>
  readonly load: (path: string) => Promise<void>
  readonly setActionError: (message: string | null) => void
  readonly setBusyTicketId: (ticketId: string | null) => void
}
