// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applicationMenuTemplate, menuBarIsVisible } from './app-menu.js'

/**
 * The menu is kept for its keyboard shortcuts, not to be read, so what matters
 * here is that the shortcuts a text field needs survive the bar being hidden,
 * and that nothing developer-facing ships to someone using the app.
 */

const roles = (platform: NodeJS.Platform, isDevelopment: boolean) =>
  applicationMenuTemplate({ platform, isDevelopment }).map((item) => item.role ?? item.label)

describe('the application menu', () => {
  it('keeps the edit shortcuts on every platform', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as NodeJS.Platform[]) {
      // Without this role, cut, copy, paste, select all and undo lose their
      // accelerators on Windows and Linux, which is the whole risk of removing
      // the default menu.
      expect(roles(platform, false)).toContain('editMenu')
    }
  })

  it('offers reload and developer tools only while developing', () => {
    expect(roles('win32', true)).toContain('View')
    expect(roles('win32', false)).not.toContain('View')

    const submenu = applicationMenuTemplate({ platform: 'win32', isDevelopment: true }).find(
      (item) => item.label === 'View',
    )?.submenu
    expect(submenu).toMatchObject([
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
    ])
  })

  it('gives Windows and Linux nothing but those, so a visible bar would be empty of claims', () => {
    expect(roles('win32', false)).toEqual(['editMenu'])
    expect(roles('linux', false)).toEqual(['editMenu'])
  })

  it('gives macOS the application menu the platform requires', () => {
    // macOS always shows a menu bar, so this one is chosen rather than inherited.
    expect(roles('darwin', false)).toEqual(['appMenu', 'editMenu', 'windowMenu'])
  })

  it('hides the bar everywhere except macOS, which cannot hide it', () => {
    expect(menuBarIsVisible('darwin')).toBe(true)
    expect(menuBarIsVisible('win32')).toBe(false)
    expect(menuBarIsVisible('linux')).toBe(false)
  })
})
