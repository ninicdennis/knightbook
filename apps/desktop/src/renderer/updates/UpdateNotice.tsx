import { Affix, Button, CloseButton, Group, Paper, Progress, Stack, Text } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { useState } from 'react'
import { DOWNLOAD_PAGE_URL, type UpdateView } from '../../shared/updates-contract.js'
import { installsInPlace, useUpdateView } from './useUpdateView.js'

/**
 * The card that says a new version is out, in the corner of every screen
 * (D-056). It never downloads or restarts on its own: each step is a button.
 * "Later" hides it until something changes, such as the download finishing.
 * A failed scheduled check is not shown here, only in Settings, so a flaky
 * network does not nag; a failed download or install is, since the user asked.
 */

export function UpdateNotice() {
  const { view, download, install } = useUpdateView()
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!view || view.mode === 'off') return null

  const key = noticeKey(view)
  if (key === null || key === dismissed) return null

  return (
    <Affix position={{ bottom: 44, right: 16 }} zIndex={150}>
      <Paper
        withBorder
        shadow="md"
        p="sm"
        w={340}
        maw="calc(100vw - 32px)"
        component="section"
        aria-label="Update"
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Stack gap={6} style={{ minWidth: 0 }}>
            <NoticeBody view={view} onDownload={download} onInstall={install} />
          </Stack>
          {view.status.phase !== 'downloading' && (
            <CloseButton size="sm" aria-label="Later" onClick={() => setDismissed(key)} />
          )}
        </Group>
      </Paper>
    </Affix>
  )
}

/** Which notice to show, or null for none. A change of key brings a hidden one back. */
function noticeKey({ status }: UpdateView): string | null {
  switch (status.phase) {
    case 'available':
    case 'downloading':
    case 'ready':
    case 'in-use':
      return `${status.phase}:${status.release.version}`
    case 'failed':
      return status.stage === 'check' ? null : `failed:${status.stage}:${status.message}`
    default:
      return null
  }
}

interface BodyProps {
  view: UpdateView
  onDownload: () => void
  onInstall: () => void
}

function NoticeBody({ view, onDownload, onInstall }: BodyProps) {
  const { status } = view
  const notes = 'release' in status && status.release ? status.release.notesUrl : null

  if (status.phase === 'available') {
    const inPlace = installsInPlace(view)
    return (
      <>
        <Text size="sm" fw={600}>
          Knightbook {status.release.version} is available
        </Text>
        <Text size="xs" c="dimmed">
          {inPlace
            ? `You have ${view.currentVersion}. Nothing is downloaded until you choose to.`
            : `You have ${view.currentVersion}. Download the new version from the website and install it over this one; your projects and settings stay as they are.`}
        </Text>
        <Group gap="xs">
          {inPlace ? (
            <Button size="xs" leftSection={<IconDownload size={14} />} onClick={onDownload}>
              Download
            </Button>
          ) : (
            <Button size="xs" onClick={() => openLink(DOWNLOAD_PAGE_URL)}>
              Open download page
            </Button>
          )}
          {notes && <NotesButton url={notes} />}
        </Group>
      </>
    )
  }

  if (status.phase === 'downloading') {
    return (
      <>
        <Text size="sm" fw={600}>
          Downloading Knightbook {status.release.version}
          {status.percent === null ? '…' : ` (${status.percent}%)`}
        </Text>
        <Progress
          value={status.percent ?? 100}
          animated={status.percent === null}
          size="sm"
          aria-label="Download progress"
        />
      </>
    )
  }

  if (status.phase === 'ready') {
    return (
      <>
        <Text size="sm" fw={600}>
          Knightbook {status.release.version} is ready to install
        </Text>
        <Text size="xs" c="dimmed">
          Restarting closes and reopens Knightbook. Save any text you are editing first. If you
          choose Later, it installs the next time you quit.
        </Text>
        <Group gap="xs">
          <Button size="xs" onClick={onInstall}>
            Restart now
          </Button>
          {notes && <NotesButton url={notes} />}
        </Group>
      </>
    )
  }

  if (status.phase === 'in-use') {
    return (
      <>
        <Text size="sm" fw={600}>
          Knightbook {status.release.version} cannot be installed yet
        </Text>
        <Text size="xs">
          An AI client is running Knightbook&apos;s MCP server, which holds{' '}
          {status.heldFiles.slice(0, 2).join(', ')}
          {status.heldFiles.length > 2 ? ` and ${status.heldFiles.length - 2} more` : ''} open.
          Close that client, or turn off its Knightbook connection, then try again. Knightbook does
          not stop it for you. Its saved MCP command keeps working after the update.
        </Text>
        <Group gap="xs">
          <Button size="xs" onClick={onInstall}>
            Try again
          </Button>
        </Group>
      </>
    )
  }

  if (status.phase === 'failed') {
    return (
      <>
        <Text size="sm" fw={600} c="orange">
          {status.stage === 'download'
            ? 'The update did not download'
            : 'The update did not install'}
        </Text>
        <Text size="xs">{status.message}</Text>
        <Group gap="xs">
          {status.stage === 'download' && (
            <Button size="xs" onClick={onDownload}>
              Try again
            </Button>
          )}
          <Button size="xs" variant="default" onClick={() => openLink(DOWNLOAD_PAGE_URL)}>
            Open download page
          </Button>
        </Group>
      </>
    )
  }

  return null
}

function NotesButton({ url }: { url: string }) {
  return (
    <Button size="xs" variant="default" onClick={() => openLink(url)}>
      Release notes
    </Button>
  )
}

function openLink(url: string): void {
  void window.knightbook.openExternalLink(url).catch(() => undefined)
}
