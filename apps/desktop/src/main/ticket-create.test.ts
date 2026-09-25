import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { parseNewTicket } = await import('./ticket-create-ipc.js')

/** The host checks what the window sends; the renderer's own checks are not trusted. */
describe('parseNewTicket', () => {
  it('trims the title and keeps the body exactly as sent', () => {
    expect(
      parseNewTicket({ title: '  A  ', type: 'research', body: '# A\n\n  indented\n' }),
    ).toEqual({ title: 'A', type: 'research', body: '# A\n\n  indented\n' })
  })

  it('treats a missing type as untyped', () => {
    expect(parseNewTicket({ title: 'A', body: '' }).type).toBeNull()
  })

  it.each([
    ['an empty title', { title: '   ', type: null, body: '' }],
    ['no title', { type: null, body: '' }],
    ['a body that is not text', { title: 'A', type: null, body: 3 }],
    ['an unknown type', { title: 'A', type: 'chore', body: '' }],
    ['nothing at all', undefined],
  ])('refuses %s', (_case, input) => {
    expect(() => parseNewTicket(input)).toThrow()
  })
})
