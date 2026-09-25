// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { WINDOW_BACKGROUND } from './window-theme.js'

vi.mock('electron', () => ({ BrowserWindow: {}, nativeTheme: {} }))

/**
 * The native window is painted before the renderer's stylesheet exists and while
 * the window is resized. If its colour differs from the page background, a band
 * of the wrong shade shows at the edge on every startup and resize.
 */

const surfaces = readFileSync(new URL('../renderer/theme/surfaces.css', import.meta.url), 'utf8')

function appBackground(selector: string): string | undefined {
  const start = surfaces.indexOf(`${selector} {`)
  const block = surfaces.slice(start, surfaces.indexOf('}', start))
  return /--ps-app-bg:\s*(#[0-9a-f]{6})/i.exec(block)?.[1]?.toLowerCase()
}

describe('the native window background', () => {
  it('matches the page background in each scheme', () => {
    expect(appBackground(':root')).toBe(WINDOW_BACKGROUND.light)
    expect(appBackground(":root[data-mantine-color-scheme='dark']")).toBe(WINDOW_BACKGROUND.dark)
  })
})
