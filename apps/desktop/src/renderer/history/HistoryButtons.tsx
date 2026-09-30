import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react'
import { IS_MAC } from '../app/shortcuts.js'

const BACK_KEYS = IS_MAC ? '⌘[' : 'Alt ←'
const FORWARD_KEYS = IS_MAC ? '⌘]' : 'Alt →'

/**
 * Visible Back and Forward, beside the view tabs. The same steps are on the
 * mouse's side buttons and the keyboard; these make them discoverable, and
 * disabled at either end rather than hidden, so the row does not shift.
 */
export function HistoryButtons({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
}) {
  return (
    <Group gap={2} wrap="nowrap" className="ps-shell-history">
      <Tooltip label={`Back (${BACK_KEYS})`} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <IconArrowLeft size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={`Forward (${FORWARD_KEYS})`} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={onForward}
        >
          <IconArrowRight size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
