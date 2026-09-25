import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { parseBlocker } = await import('./ticket-edit-ipc.js')

/** The host decides what is stored; the window's own trimming is not trusted. */
describe('parseBlocker', () => {
  it('keeps a reason, trimmed', () => {
    expect(parseBlocker('  Waiting on design.\n')).toBe('Waiting on design.')
  })

  it.each([
    ['null', null],
    ['empty text', ''],
    ['only whitespace', ' \n\t '],
  ])('stores no blocker for %s', (_case, input) => {
    expect(parseBlocker(input)).toBeNull()
  })

  it.each([
    ['a number', 3],
    ['nothing at all', undefined],
    ['an object', { text: 'x' }],
  ])('refuses %s', (_case, input) => {
    expect(() => parseBlocker(input)).toThrow()
  })
})
