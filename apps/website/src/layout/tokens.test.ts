import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Reads tokens.css as a visitor's browser would apply it: the light values in
 * `:root`, then the dark overrides. Contrast is measured, not assumed, with the
 * WCAG 2 formula; 4.5:1 is the level for ordinary text.
 */

const CSS = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

const NAMED_TOKENS = [
  'background',
  'surface',
  'text',
  'muted',
  'accent',
  'success',
  'warning',
  'danger',
  'border',
  'radius',
  'space-4',
]

const COLOUR_TOKENS = [
  'background',
  'surface',
  'surface-quiet',
  'text',
  'muted',
  'accent',
  'accent-strong',
  'on-accent',
  'success',
  'warning',
  'danger',
  'border',
  'focus',
]

function declarations(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/--kb-([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]?.trim()]),
  )
}

const light = declarations(CSS.split('@media (prefers-color-scheme: dark)')[0] ?? '')
const dark = {
  ...light,
  ...declarations(CSS.split('@media (prefers-color-scheme: dark)')[1] ?? ''),
}

function luminance(hex: string) {
  const channels = (hex.match(/^#(..)(..)(..)$/)?.slice(1) ?? []).map((pair) => {
    const value = parseInt(pair, 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red = 0, green = 0, blue = 0] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

/** Text tokens and the surfaces each one is drawn on. */
const PAIRS = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surface-quiet'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['muted', 'surface-quiet'],
  ['accent', 'background'],
  ['accent', 'surface'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-strong'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
] as const

describe('the design tokens', () => {
  it('define every token the layout relies on', () => {
    for (const name of NAMED_TOKENS) expect(light[name], name).toBeDefined()
  })

  it('give every colour its own dark value', () => {
    const darkBlock = declarations(CSS.split('@media (prefers-color-scheme: dark)')[1] ?? '')
    for (const name of COLOUR_TOKENS) expect(darkBlock[name], name).toBeDefined()
  })

  for (const [scheme, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`keep text at 4.5:1 or more against its surface in ${scheme}`, () => {
      for (const [foreground, background] of PAIRS) {
        const ratio = contrast(tokens[foreground] ?? '', tokens[background] ?? '')
        expect(ratio, `${foreground} on ${background}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          4.5,
        )
      }
    })

    // The focus ring and the Download button's hover fill are essential boundaries
    // of controls, which need 3:1 against what surrounds them.
    it(`keep the focus ring and the button's hover fill at 3:1 or more in ${scheme}`, () => {
      for (const [foreground, background] of [
        ['focus', 'background'],
        ['focus', 'surface'],
        ['focus', 'surface-quiet'],
        ['accent-strong', 'surface'],
      ] as const) {
        const ratio = contrast(tokens[foreground] ?? '', tokens[background] ?? '')
        expect(ratio, `${foreground} on ${background}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          3,
        )
      }
    })
  }

  it('lay pages out on a 1120px content width', () => {
    expect(light['page-width']).toBe('1120px')
  })
})
