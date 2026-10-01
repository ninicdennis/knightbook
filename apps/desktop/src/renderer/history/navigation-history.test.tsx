import { describe, expect, it } from 'vitest'
import { historyShortcut } from '../app/shortcuts.js'
import {
  BOARD,
  currentPlace,
  dropPlace,
  pushPlace,
  startHistory,
  stepIndex,
  type Place,
} from './navigation-history.js'

const doc = (path: string, fragment: string | null = null): Place => ({
  ...BOARD,
  view: 'documents',
  document: { path, fragment },
})

describe('the history of places', () => {
  it('steps back and forward', () => {
    const history = pushPlace(pushPlace(startHistory(), doc('a.md')), doc('b.md'))
    expect(stepIndex(history, -1)).toBe(1)
    expect(stepIndex(history, 1)).toBeNull()
    expect(stepIndex({ ...history, index: 0 }, -1)).toBeNull()
  })

  it('discards forward steps on a new navigation after going back', () => {
    const history = pushPlace(pushPlace(startHistory(), doc('a.md')), doc('b.md'))
    const back = { ...history, index: 1 }
    const next = pushPlace(back, doc('c.md'))
    expect(next.entries.map((place) => place.document?.path ?? place.view)).toEqual([
      'board',
      'a.md',
      'c.md',
    ])
    expect(stepIndex(next, 1)).toBeNull()
  })

  it('does not add a step for the same place, only updates its heading', () => {
    const history = pushPlace(pushPlace(startHistory(), doc('a.md')), doc('a.md', 'setup'))
    expect(history.entries).toHaveLength(2)
    expect(currentPlace(history).document?.fragment).toBe('setup')
  })

  it('drops a stale place and keeps the current one current', () => {
    const history = pushPlace(pushPlace(startHistory(), doc('gone.md')), doc('b.md'))
    const dropped = dropPlace(history, 1)
    expect(dropped.entries).toHaveLength(2)
    expect(currentPlace(dropped).document?.path).toBe('b.md')
    expect(dropPlace(history, history.index)).toBe(history)
  })

  it('keeps at most a hundred places', () => {
    let history = startHistory()
    for (let i = 0; i < 150; i++) history = pushPlace(history, doc(`${i}.md`))
    expect(history.entries).toHaveLength(100)
    expect(currentPlace(history).document?.path).toBe('149.md')
  })
})

describe('the history shortcuts', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

  it('uses Alt+arrows on Windows and Linux', () => {
    expect(historyShortcut(key({ key: 'ArrowLeft', altKey: true }), false)).toBe(-1)
    expect(historyShortcut(key({ key: 'ArrowRight', altKey: true }), false)).toBe(1)
    expect(historyShortcut(key({ key: 'ArrowLeft' }), false)).toBeNull()
    expect(historyShortcut(key({ key: '[', metaKey: true }), false)).toBeNull()
  })

  it('uses Cmd+brackets on macOS', () => {
    expect(historyShortcut(key({ key: '[', metaKey: true }), true)).toBe(-1)
    expect(historyShortcut(key({ key: ']', metaKey: true }), true)).toBe(1)
    expect(historyShortcut(key({ key: 'ArrowLeft', altKey: true }), true)).toBeNull()
    expect(historyShortcut(key({ key: '[', ctrlKey: true }), true)).toBeNull()
  })
})
