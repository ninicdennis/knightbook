import { basename } from 'node:path'

/**
 * What the title bar and taskbar entry say. Two clones of one project share a
 * name, so the checkout folder is what tells their windows apart from outside.
 */

export const PLAIN_WINDOW_TITLE = 'Knightbook'

/**
 * The renderer's argument is checked rather than trusted: anything that is not
 * a name and a path claims no project, instead of putting a malformed value in
 * the title bar.
 */
export function windowTitleFor(project: unknown): string {
  if (typeof project !== 'object' || project === null) return PLAIN_WINDOW_TITLE
  const { name, checkoutPath } = project as { name?: unknown; checkoutPath?: unknown }
  if (typeof name !== 'string' || typeof checkoutPath !== 'string') return PLAIN_WINDOW_TITLE
  if (name === '' || checkoutPath === '') return PLAIN_WINDOW_TITLE

  // A drive root has no folder name of its own; the path is then the clearest thing to show.
  const folder = basename(checkoutPath) || checkoutPath
  return `${name} — ${folder}`
}
