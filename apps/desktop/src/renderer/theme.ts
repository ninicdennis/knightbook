import { Badge, createTheme, type MantineColorsTuple } from '@mantine/core'

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

export const theme = createTheme({
  primaryColor: 'accent',
  colors: { accent },
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
