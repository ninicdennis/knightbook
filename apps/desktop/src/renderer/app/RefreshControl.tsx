import { ActionIcon, Loader, Tooltip, VisuallyHidden } from '@mantine/core'
import { IconCheck, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'

/**
 * Manual refresh, at the end of the footer. It is an occasional utility: the
 * project is read again every time the window regains focus, so this is for
 * the moment an AI tool writes while the window is already in front.
 *
 * While reading, it shows a spinner. After a refresh the user asked for
 * succeeds it shows a green check for a moment, so a click that changed
 * nothing on screen still visibly did something. The check is only for the
 * user's own click: refreshes on focus happen on every return to the window,
 * and a check flashing each time would be noise. A failed refresh shows no
 * check; the alert above the board says what went wrong.
 */

const CONFIRMATION_MS = 2000

interface Props {
  refreshing: boolean
  onRefresh: () => Promise<boolean>
}

export function RefreshControl({ refreshing, onRefresh }: Props) {
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (!confirmed) return
    const timer = setTimeout(() => setConfirmed(false), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [confirmed])

  const refresh = () => {
    // Ignored rather than disabled, so keyboard focus stays on the button.
    if (refreshing) return
    setConfirmed(false)
    void onRefresh().then(setConfirmed)
  }

  const showCheck = confirmed && !refreshing

  return (
    <>
      <Tooltip
        multiline
        w={260}
        withArrow
        position="top-end"
        label="Reload from the project files. This also happens when you return to this window."
      >
        <ActionIcon
          variant="subtle"
          color={showCheck ? 'green' : 'gray'}
          size="md"
          onClick={refresh}
          aria-label="Refresh from disk"
        >
          {refreshing ? (
            <Loader size={12} />
          ) : showCheck ? (
            <IconCheck size={16} />
          ) : (
            <IconRefresh size={16} />
          )}
        </ActionIcon>
      </Tooltip>
      <VisuallyHidden component="output">{showCheck ? 'Refreshed from disk' : ''}</VisuallyHidden>
    </>
  )
}
