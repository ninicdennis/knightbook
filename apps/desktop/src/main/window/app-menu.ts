import type { MenuItemConstructorOptions } from 'electron'

/**
 * The application menu, which exists for its keyboard shortcuts rather than to
 * be looked at.
 *
 * Electron builds a File/Edit/View/Window/Help menu when an application does not
 * set one. It was the only part of this window nobody designed, it names actions
 * this app does not have, and it sat above a header that already carries the
 * project, the view switch and search.
 *
 * Removing it outright with `setApplicationMenu(null)` would also unregister the
 * edit accelerators on Windows and Linux, where they are the menu's to provide —
 * a board whose Ctrl+C has quietly stopped working is worse than a menu nobody
 * reads. So the menu is kept, cut down to the roles worth having, and the bar is
 * hidden instead (`setMenuBarVisibility(false)` in the window, with
 * `autoHideMenuBar` left off so Alt does not summon it back).
 *
 * macOS keeps a visible application menu because the platform requires one. What
 * is in it is chosen here rather than inherited: the standard application and
 * edit menus, window management, and nothing claiming to do things this app
 * cannot.
 */

interface MenuContext {
  readonly platform: NodeJS.Platform
  /** Reload and developer tools are for developing the app, not for using it. */
  readonly isDevelopment: boolean
}

/** Cut, copy, paste, select all and undo, which text fields need on every platform. */
const EDIT: MenuItemConstructorOptions = { role: 'editMenu' }

/**
 * Named items rather than `viewMenu`, which would also carry zoom and full
 * screen. Those are not this window's to offer while the menu is invisible.
 */
const DEVELOPER: MenuItemConstructorOptions = {
  label: 'View',
  submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
}

export function applicationMenuTemplate({
  platform,
  isDevelopment,
}: MenuContext): MenuItemConstructorOptions[] {
  const developer = isDevelopment ? [DEVELOPER] : []

  if (platform === 'darwin') {
    return [{ role: 'appMenu' }, EDIT, ...developer, { role: 'windowMenu' }]
  }
  return [EDIT, ...developer]
}

/** Whether this platform shows the menu at all, as opposed to keeping it for its keys. */
export function menuBarIsVisible(platform: NodeJS.Platform): boolean {
  return platform === 'darwin'
}
