/**
 * Where the window opens. The stored record comes from `app-state.json`, which
 * can be hand-edited, written by another version, or describe a monitor that has
 * since been unplugged, so every awkward case is decided here, away from
 * Electron, where it can be tested.
 */

export interface Rectangle {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface StoredWindowState {
  /** The unmaximized bounds, kept while maximized so unmaximizing lands there. */
  readonly bounds: Rectangle
  readonly maximized: boolean
}

export interface WindowPlacement {
  /** Absent means "let the operating system choose", which centres the window. */
  readonly position?: { readonly x: number; readonly y: number }
  readonly width: number
  readonly height: number
  readonly maximized: boolean
}

export const DEFAULT_SIZE = { width: 1280, height: 860 } as const
export const MINIMUM_SIZE = { width: 720, height: 480 } as const

const DEFAULT_PLACEMENT: WindowPlacement = { ...DEFAULT_SIZE, maximized: false }

/*
 * A window only counts as visible if enough of its top edge is on a display to
 * grab and drag it back. A sliver of border on screen does not count: the user
 * could not recover the window from it.
 */
const GRAB_STRIP_HEIGHT = 32
const GRAB_STRIP_MIN_WIDTH = 100

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Anything short of a complete, numeric record is discarded rather than patched up. */
export function parseWindowState(stored: unknown): StoredWindowState | null {
  if (typeof stored !== 'object' || stored === null) return null
  const { bounds, maximized } = stored as { bounds?: unknown; maximized?: unknown }
  if (typeof maximized !== 'boolean') return null
  if (typeof bounds !== 'object' || bounds === null) return null

  const { x, y, width, height } = bounds as Record<string, unknown>
  if (![x, y, width, height].every(isFiniteNumber)) return null
  if ((width as number) <= 0 || (height as number) <= 0) return null

  return {
    bounds: {
      x: Math.round(x as number),
      y: Math.round(y as number),
      width: Math.round(width as number),
      height: Math.round(height as number),
    },
    maximized,
  }
}

function overlap(a: Rectangle, b: Rectangle): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  }
}

function isGrabbable(bounds: Rectangle, workAreas: readonly Rectangle[]): boolean {
  const strip = { x: bounds.x, y: bounds.y, width: bounds.width, height: GRAB_STRIP_HEIGHT }
  return workAreas.some((area) => {
    const shared = overlap(strip, area)
    return shared.width >= GRAB_STRIP_MIN_WIDTH && shared.height >= GRAB_STRIP_HEIGHT
  })
}

/**
 * The placement to open with, given what was stored and the work areas of the
 * displays attached right now. Falls back to the default size, centred, when
 * there is nothing usable or the stored window could not be reached.
 */
export function resolveWindowPlacement(
  stored: unknown,
  workAreas: readonly Rectangle[],
): WindowPlacement {
  const state = parseWindowState(stored)
  if (state === null) return DEFAULT_PLACEMENT

  const bounds: Rectangle = {
    ...state.bounds,
    width: Math.max(state.bounds.width, MINIMUM_SIZE.width),
    height: Math.max(state.bounds.height, MINIMUM_SIZE.height),
  }
  if (!isGrabbable(bounds, workAreas)) return DEFAULT_PLACEMENT

  return {
    position: { x: bounds.x, y: bounds.y },
    width: bounds.width,
    height: bounds.height,
    maximized: state.maximized,
  }
}
