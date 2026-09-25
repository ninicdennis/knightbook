// @vitest-environment node
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAIN_WINDOW_TITLE, windowTitleFor } from './window-title.js'

describe('the window title', () => {
  it('names the project and the checkout folder it came from', () => {
    const checkoutPath = join('projects', 'clones', 'projectspace-second')
    expect(windowTitleFor({ name: 'Projectspace', checkoutPath })).toBe(
      'Projectspace — projectspace-second',
    )
  })

  it('uses the name from the record as it is, however long, without reformatting it', () => {
    const name = '  A very long project name that goes on and on, with punctuation!  '
    expect(windowTitleFor({ name, checkoutPath: join('x', 'folder') })).toBe(`${name} — folder`)
  })

  it('claims no project when none is open', () => {
    expect(windowTitleFor(null)).toBe(PLAIN_WINDOW_TITLE)
  })

  it('claims no project for anything that is not a name and a path', () => {
    for (const value of [
      undefined,
      'Projectspace',
      { name: 'Projectspace' },
      { name: 42, checkoutPath: 'C:\\x' },
      { name: '', checkoutPath: 'C:\\x' },
      { name: 'Projectspace', checkoutPath: '' },
    ]) {
      expect(windowTitleFor(value)).toBe(PLAIN_WINDOW_TITLE)
    }
  })
})
