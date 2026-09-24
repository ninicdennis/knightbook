import {
  Badge,
  createTheme,
  SegmentedControl,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core'

/**
 * One place for colour, spacing, and radius, as the specification's UI guidance
 * asks. Status colours are defined here rather than at each call site so a
 * column, a badge, and a card border cannot drift apart.
 *
 * The board's surface shades are not here: they are CSS custom properties in
 * surfaces.css, because the same values are needed by plain CSS and by the
 * native window background.
 */

const accent: MantineColorsTuple = [
  '#eef3ff',
  '#dce4f5',
  '#b9c7e2',
  '#94a8d0',
  '#748dc0',
  '#5f7cb8',
  '#5474b4',
  '#44639f',
  '#3a588f',
  '#2c4b80',
]

/**
 * Mantine's dark scale, re-tinted to the board's blue-grey. Mantine draws every
 * default control, input, border and secondary text in dark mode from this
 * scale, so without it each dialog and menu came out in a neutral grey that
 * matched nothing on the board. Index 2 (secondary text) is `--ps-text-muted`,
 * index 6 (default controls) sits just above the card layer, and 7 to 9 are the
 * column, quiet column and window layers from surfaces.css.
 */
const dark: MantineColorsTuple = [
  '#c9cdd6',
  '#b4b9c4',
  '#8c939f',
  '#6c7380',
  '#3d4350',
  '#343945',
  '#2a2e38',
  '#1c1f26',
  '#181b21',
  '#14161a',
]

export const theme = createTheme({
  primaryColor: 'accent',
  colors: { accent, dark },
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '600' },
  components: {
    /**
     * A card can carry several of these at once. Mantine sets them in small
     * spaced capitals by default, which made a stack of short status words
     * heavier than the ticket title above them.
     */
    Badge: Badge.extend({
      styles: { label: { textTransform: 'none', letterSpacing: 0, fontWeight: 600 } },
    }),
    /** Styled in components.css, so every segmented control matches the header's. */
    SegmentedControl: SegmentedControl.extend({
      classNames: {
        root: 'ps-segmented',
        indicator: 'ps-segmented-indicator',
        label: 'ps-segmented-label',
      },
    }),
  },
})

export const STATUS_COLOR = {
  backlog: 'gray',
  in_progress: 'blue',
  verification: 'yellow',
  done: 'teal',
} as const

export const STATUS_LABEL = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  verification: 'Verification',
  done: 'Done',
} as const

/**
 * Light mode's text colours, where Mantine's fall short of 4.5:1 on white and on
 * the board's column layer. Secondary text becomes `--ps-text-muted`; warning
 * and error text (`c="orange"`, `c="red"`) move from about 2.6:1 and 3.3:1 to
 * about 5.5:1. Dark mode already clears 4.5:1, partly through the `dark` scale.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-dimmed': '#5f6673',
    '--mantine-color-orange-text': '#b54708',
    '--mantine-color-red-text': '#c92a2a',
  },
  dark: {},
})
