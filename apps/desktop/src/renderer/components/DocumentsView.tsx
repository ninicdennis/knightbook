import {
  Alert,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core'
import { IconAlertTriangle, IconEyeOff, IconFileText } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { DocumentListView, DocumentReadView, Result } from '../../shared/contract.js'
import type { LinkRequest, ScrollTarget } from '../hooks/useLinkNavigation.js'
import { DocumentReader } from './DocumentReader.js'
import { IncludedEntries } from './IncludedEntries.js'

/**
 * Reading project documentation. Editing stays in the user's own editor until
 * the formatted-editor question is settled, so this is deliberately read-only
 * and says so, rather than offering an edit affordance that does not work.
 */

interface Props {
  rootPath: string
  /** Asks the view to show one document. The nonce lets the same path be asked for twice. */
  openTarget?: { path: string; nonce: number; scrollTo: ScrollTarget | null } | null
  /** Changes whenever the project is refreshed, so the view re-reads from disk. */
  refreshToken?: number
  /** Follows a link found in the document at `fromPath`; resolves to a failure message. */
  onFollowLink: (fromPath: string, request: LinkRequest) => Promise<string | null>
  /** The way back to where a link to `path` was followed from, if any. */
  backFor: (path: string) => { label: string; onBack: () => void } | null
}

export function DocumentsView({
  rootPath,
  openTarget = null,
  refreshToken = 0,
  onFollowLink,
  backFor,
}: Props) {
  const [listing, setListing] = useState<DocumentListView | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [document, setDocument] = useState<DocumentReadView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.knightbook.listDocuments(rootPath).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setListing(result.value)
        setSelected((current) => current ?? result.value.documents[0]?.path ?? null)
      } else {
        setError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, refreshToken])

  useEffect(() => {
    if (openTarget) setSelected(openTarget.path)
  }, [openTarget])

  const open = useCallback(
    async (path: string) => {
      setSelected(path)
      setError(null)
      const result = await window.knightbook.readDocument(rootPath, path)
      if (result.ok) setDocument(result.value)
      else {
        setDocument(null)
        setError(result.message)
      }
    },
    [rootPath],
  )

  useEffect(() => {
    if (selected) void open(selected)
  }, [selected, open, refreshToken])

  /**
   * Including and removing both return the whole listing, so the view shows what
   * the manifest now says rather than guessing at the result. A selected
   * document that has just been removed is dropped from the selection instead of
   * being left on screen as if it were still included.
   */
  const applyToManifest = useCallback(async (run: () => Promise<Result<DocumentListView>>) => {
    setBusy(true)
    setError(null)

    const result = await run()
    if (result.ok) {
      setListing(result.value)
      setSelected((current) =>
        current && result.value.documents.some((item) => item.path === current)
          ? current
          : (result.value.documents[0]?.path ?? null),
      )
    } else setError(result.message)
    setBusy(false)
  }, [])

  /**
   * Reviews exactly the revision the reader showed. If the file moved on, the
   * host refuses; the reader is refreshed first so the explanation sits above
   * the version the user now has to read.
   */
  const review = useCallback(
    async (revision: string) => {
      if (!document) return
      const result = await window.knightbook.reviewDocument(rootPath, document.path, revision)
      if (result.ok) {
        setDocument(result.value)
        const refreshed = await window.knightbook.listDocuments(rootPath)
        if (refreshed.ok) setListing(refreshed.value)
      } else if (result.code === 'revision_conflict') {
        await open(document.path)
        setError(result.message)
      } else setError(result.message)
    },
    [rootPath, document, open],
  )

  if (loading) {
    return (
      <Center style={{ height: '100%' }}>
        <Stack align="center" gap="xs">
          <Loader />
          <Text size="sm" c="dimmed">
            Reading project files…
          </Text>
        </Stack>
      </Center>
    )
  }

  const entries = listing && (
    <IncludedEntries
      listing={listing}
      busy={busy}
      onIncludeFiles={() =>
        void applyToManifest(() => window.knightbook.includeDocumentFiles(rootPath))
      }
      onIncludeFolder={() =>
        void applyToManifest(() => window.knightbook.includeDocumentFolder(rootPath))
      }
      onRemove={(entry) =>
        void applyToManifest(() => window.knightbook.removeDocumentEntry(rootPath, entry))
      }
    />
  )

  if (!listing || listing.documents.length === 0) {
    return (
      <Center style={{ height: '100%' }}>
        <Alert
          icon={<IconFileText size={18} />}
          color="blue"
          variant="light"
          title="No documents included yet"
          w={520}
          maw="100%"
        >
          <Stack gap="sm">
            <Text size="sm">
              Existing Markdown stays where it already lives. Nothing is copied or moved when it is
              included here.
            </Text>
            <Text size="sm" c="dimmed">
              Include files or a folder below, or let an AI tool connected to this project do it
              through MCP.
            </Text>
            {error && (
              <Text size="sm" c="orange">
                {error}
              </Text>
            )}
            {entries}
          </Stack>
        </Alert>
      </Center>
    )
  }

  return (
    <Group className="ps-reading" align="stretch" gap="md" wrap="nowrap" style={{ height: '100%' }}>
      <Card withBorder padding="xs" radius="md" w={280} style={{ flexShrink: 0 }}>
        <ScrollArea.Autosize mah="calc(100vh - 140px)" type="hover">
          <Stack gap={2}>
            {listing.documents.map((item) => (
              <NavLink
                key={item.path}
                active={item.path === selected}
                label={item.title}
                description={item.path}
                onClick={() => setSelected(item.path)}
                rightSection={
                  item.review.state !== 'reviewed' ? (
                    <IconEyeOff size={13} opacity={0.5} />
                  ) : undefined
                }
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>

        <Divider my="xs" />
        {entries}
      </Card>

      <Card withBorder padding="md" radius="md" style={{ flex: 1, minWidth: 0 }}>
        {error && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="orange"
            variant="light"
            mb="sm"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        {document && (
          <DocumentReader
            rootPath={rootPath}
            document={document}
            onReview={(revision) => void review(revision)}
            onOpenExternally={() =>
              void window.knightbook.openDocumentExternally(rootPath, document.path)
            }
            onFollowLink={(request) => onFollowLink(document.path, request)}
            // Only the document a link asked for scrolls to the link's heading.
            scrollTo={openTarget?.path === document.path ? openTarget.scrollTo : null}
            back={backFor(document.path)}
          />
        )}
      </Card>
    </Group>
  )
}
