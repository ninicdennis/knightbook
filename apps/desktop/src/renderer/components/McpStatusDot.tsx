import {
  IconAlertTriangle,
  IconHelpCircle,
  IconPlug,
  IconPlugConnected,
  IconPlugOff,
} from '@tabler/icons-react'
import type { McpState } from '../mcp-status.js'

/**
 * The indicator's glyph. Every state has its own shape as well as its own
 * colour, so the status survives a colour-blind reader, a greyscale screenshot,
 * and a high-contrast theme. The text label beside it carries the meaning; this
 * is the fast visual cue, never the only one.
 */

const GLYPH = {
  connected: { Icon: IconPlugConnected, color: 'var(--mantine-color-teal-5)' },
  running: { Icon: IconPlug, color: 'var(--mantine-color-blue-5)' },
  not_connected: { Icon: IconPlugOff, color: 'var(--mantine-color-dimmed)' },
  runtime_missing: { Icon: IconAlertTriangle, color: 'var(--mantine-color-orange-5)' },
  unknown: { Icon: IconHelpCircle, color: 'var(--mantine-color-dimmed)' },
} as const satisfies Record<McpState, unknown>

export function McpStatusDot({ state }: { state: McpState }) {
  const { Icon, color } = GLYPH[state]
  return <Icon size={14} color={color} aria-hidden />
}
