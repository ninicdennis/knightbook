import { Text } from '@mantine/core'
import markUrl from './knightbook-mark.png'

/**
 * The window draws its own title bar (D-030). With a project open, the header's
 * first row is the title bar; these are the pieces it shares with the screens
 * that have no project yet. How the row keeps clear of the window controls and
 * which parts of it drag the window is in shell.css.
 */

/**
 * The approved logo (D-021), derived at 96px by `derive:icon`. Decorative: the
 * project name or the product name always sits beside it as text.
 */
export function KnightbookMark() {
  return <img src={markUrl} alt="" className="ps-titlebar-mark" draggable={false} />
}

/**
 * The title bar on its own, for the welcome, setup, loading and error screens.
 * It names the product where the operating system's title bar used to, and
 * gives the window somewhere to be dragged from.
 */
export function TitleStrip() {
  return (
    <div className="ps-titlebar ps-titlebar-strip">
      <KnightbookMark />
      <Text size="sm" fw={600}>
        Knightbook
      </Text>
    </div>
  )
}
