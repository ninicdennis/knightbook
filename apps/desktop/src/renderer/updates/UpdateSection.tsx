import { Button, Group, Text } from '@mantine/core'
import type { UpdateView } from '../../shared/updates-contract.js'
import { useUpdateView } from './useUpdateView.js'

/**
 * Settings' line on updates, with the manual check (D-056). It says what the last
 * check found and when; a check that failed says it failed, never "up to date".
 * Offers and downloads are acted on in the corner notice, not here.
 */

export function UpdateSection() {
  const { view, check } = useUpdateView()
  if (!view) return null

  const busy = view.status.phase === 'checking' || view.status.phase === 'downloading'
  return (
    <>
      <Text size="xs" c="dimmed">
        Updates
      </Text>
      <Text
        size="sm"
        {...(view.status.phase === 'failed' ? { c: 'orange' } : {})}
        data-testid="update-line"
      >
        {describe(view)}
      </Text>
      {view.mode !== 'off' && (
        <Group>
          <Button size="xs" variant="default" onClick={check} loading={busy} disabled={busy}>
            Check for updates
          </Button>
        </Group>
      )}
    </>
  )
}

function describe(view: UpdateView): string {
  if (view.mode === 'off')
    return 'This build does not check for updates: it is not an installed release.'
  const { status } = view
  switch (status.phase) {
    case 'idle':
      return 'Not checked yet since Knightbook opened.'
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return `Up to date. Last checked ${new Date(status.checkedAt).toLocaleString()}.`
    case 'available':
      return view.mode === 'install' && status.release.installable
        ? `Knightbook ${status.release.version} is available to download.`
        : `Knightbook ${status.release.version} is available from the download page.`
    case 'downloading':
      return `Downloading Knightbook ${status.release.version}.`
    case 'ready':
      return `Knightbook ${status.release.version} is downloaded and installs when you restart or quit.`
    case 'in-use':
      return `Knightbook ${status.release.version} is waiting for the MCP server to be closed.`
    case 'failed':
      return status.message
  }
}
