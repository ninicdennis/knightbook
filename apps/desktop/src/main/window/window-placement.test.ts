// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_SIZE, parseWindowState, resolveWindowPlacement } from './window-placement.js'

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 }
const SECONDARY = { x: 1920, y: 0, width: 2560, height: 1400 }

const DEFAULT = { ...DEFAULT_SIZE, maximized: false }

function stored(bounds: object, maximized: unknown = false) {
  return { bounds, maximized }
}

describe('reading the stored window', () => {
  it('opens at the default size, centred, when nothing was stored', () => {
    expect(resolveWindowPlacement(undefined, [PRIMARY])).toEqual(DEFAULT)
  })

  it('discards a partial record instead of filling in the gaps', () => {
    expect(parseWindowState({ bounds: { x: 10, y: 10, width: 900 }, maximized: false })).toBeNull()
    expect(parseWindowState({ bounds: { x: 10, y: 10, width: 900, height: 700 } })).toBeNull()
    expect(resolveWindowPlacement({ maximized: true }, [PRIMARY])).toEqual(DEFAULT)
  })

  it('discards non-numeric, non-finite and non-positive values', () => {
    for (const bounds of [
      { x: '10', y: 10, width: 900, height: 700 },
      { x: 10, y: 10, width: Number.NaN, height: 700 },
      { x: 10, y: 10, width: 900, height: -700 },
      { x: 10, y: 10, width: 0, height: 700 },
    ]) {
      expect(resolveWindowPlacement(stored(bounds), [PRIMARY])).toEqual(DEFAULT)
    }
    expect(resolveWindowPlacement(stored(PRIMARY, 'yes'), [PRIMARY])).toEqual(DEFAULT)
    expect(resolveWindowPlacement('not an object', [PRIMARY])).toEqual(DEFAULT)
  })
})

describe('placing the window', () => {
  it('restores the stored bounds on a display that is attached', () => {
    expect(
      resolveWindowPlacement(stored({ x: 2000, y: 100, width: 1000, height: 800 }), [
        PRIMARY,
        SECONDARY,
      ]),
    ).toEqual({ position: { x: 2000, y: 100 }, width: 1000, height: 800, maximized: false })
  })

  it('raises a size below the minimums to them rather than refusing it', () => {
    expect(
      resolveWindowPlacement(stored({ x: 100, y: 100, width: 300, height: 200 }), [PRIMARY]),
    ).toEqual({ position: { x: 100, y: 100 }, width: 720, height: 480, maximized: false })
  })

  it('falls back to the default when the window was on a display no longer attached', () => {
    const onUnpluggedMonitor = stored({ x: 2000, y: 100, width: 1000, height: 800 })
    expect(resolveWindowPlacement(onUnpluggedMonitor, [PRIMARY])).toEqual(DEFAULT)
    expect(resolveWindowPlacement(onUnpluggedMonitor, [])).toEqual(DEFAULT)
  })

  it('keeps a window partly off a display while its top edge can still be grabbed', () => {
    const hangingOffTheRight = stored({ x: 1500, y: 200, width: 1000, height: 800 })
    expect(resolveWindowPlacement(hangingOffTheRight, [PRIMARY])).toMatchObject({
      position: { x: 1500, y: 200 },
    })
  })

  it('falls back when only a sliver, or only the bottom, is on screen', () => {
    const sliverOnTheRight = stored({ x: 1880, y: 200, width: 1000, height: 800 })
    const titleBarAboveTheScreen = stored({ x: 200, y: -600, width: 1000, height: 800 })
    expect(resolveWindowPlacement(sliverOnTheRight, [PRIMARY])).toEqual(DEFAULT)
    expect(resolveWindowPlacement(titleBarAboveTheScreen, [PRIMARY])).toEqual(DEFAULT)
  })

  it('restores a maximized window maximized, with the bounds it unmaximizes to', () => {
    expect(
      resolveWindowPlacement(stored({ x: 300, y: 150, width: 1100, height: 750 }, true), [PRIMARY]),
    ).toEqual({ position: { x: 300, y: 150 }, width: 1100, height: 750, maximized: true })
  })
})
