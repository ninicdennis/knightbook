import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle, IconFileText } from '@tabler/icons-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentListView, DocumentReadView, Result } from '../../shared/contract.js'
import type { LinkRequest, ScrollTarget } from '../markdown/useLinkNavigation.js'
import { DocumentNav } from './DocumentNav.js'
import { DocumentReader, type ReaderState } from './DocumentReader.js'
import { IncludedEntries } from './IncludedEntries.js'

/**
 * Reading project documentation: a list of included documents beside a reader.
 * On a narrow window the two take turns, with a way back to the list, because
 * a squeezed side-by-side layout leaves neither readable.
 *
 * Three kinds of failure are kept apart, because each leaves something different
 * on screen: the list could not be read, one document could not be read, or an
 * action on the manifest or a review was refused.
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

/** Matches Mantine's `sm` breakpoint (48em), below which the panels take turns. */
const NARROW_QUERY = '(max-width: 47.99em)'

export function DocumentsView({
  rootPath,
  openTarget = null,
  refreshToken = 0,
  onFollowLink,
  backFor,
}: Props) {
  const [listing, setListing] = useState<DocumentListView | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listAttempt, setListAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [document, setDocument] = useState<DocumentReadView | null>(null)
  const [readError, setReadError] = useState<{ path: string; message: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const narrow = useMediaQuery(NARROW_QUERY) ?? false
  const [pane, setPane] = useState<'list' | 'reader'>('list')
  const navRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moveFocus = useRef(false)

  useEffect(() => {
    let cancelled = false
    void window.knightbook.listDocuments(rootPath).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setListing(result.value)
        setListError(null)
        setSelected((current) => current ?? result.value.documents[0]?.path ?? null)
      } else {
        setListError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, refreshToken, listAttempt])

  useEffect(() => {
    if (!openTarget) return
    setSelected(openTarget.path)
    setPane('reader')
  }, [openTarget])

  const read = useCallback(
    async (path: string) => {
      setReadError(null)
      const result = await window.knightbook.readDocument(rootPath, path)
      if (result.ok) setDocument(result.value)
      else {
        setDocument(null)
        setReadError({ path, message: result.message })
      }
    },
    [rootPath],
  )

  useEffect(() => {
    if (selected) void read(selected)
  }, [selected, read, refreshToken])

  // Switching panes on a narrow window moves focus with it, so a keyboard user
  // lands on what just appeared instead of on a control that has gone.
  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    if (pane === 'reader') headingRef.current?.focus()
    else
      [...(navRef.current?.querySelectorAll<HTMLElement>('[data-document-path]') ?? [])]
        .find((item) => item.dataset.documentPath === selected)
        ?.focus()
  }, [pane, selected])

  const choose = (path: string) => {
    setSelected(path)
    moveFocus.current = narrow
    setPane('reader')
  }

  /**
   * Including and removing both return the whole listing, so the view shows what
   * the manifest now says rather than guessing at the result. A selected
   * document that has just been removed is dropped from the selection instead of
   * being left on screen as if it were still included.
   */
  const applyToManifest = useCallback(async (run: () => Promise<Result<DocumentListView>>) => {
    setBusy(true)
    setActionError(null)

    const result = await run()
    if (result.ok) {
      setListing(result.value)
      setSelected((current) =>
        current && result.value.documents.some((item) => item.path === current)
          ? current
          : (result.value.documents[0]?.path ?? null),
      )
    } else setActionError(result.message)
    setBusy(false)
  }, [])

  /** A folder title changes only the manifest, so the listing it returns is the whole answer. */
  const setFolderTitle = useCallback(
    async (folder: string, title: string | null) => {
      const result = await window.knightbook.setDocumentFolderTitle(rootPath, folder, title)
      if (!result.ok) return result.message
      setListing(result.value)
      return null
    },
    [rootPath],
  )

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
        await read(document.path)
        setActionError(result.message)
      } else setActionError(result.message)
    },
    [rootPath, document, read],
  )

  if (!listing) {
    return listError ? (
      <ListFailed message={listError} onRetry={() => setListAttempt((n) => n + 1)} />
    ) : (
      <Center style={{ height: '100%' }}>
        <Stack align="center" gap="xs">
          <Loader />
          <Text size="sm" c="var(--ps-text-muted)">
            Reading project files…
          </Text>
        </Stack>
      </Center>
    )
  }

  const entries = (
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

  const refreshFailure =
    listError &&
    `Could not re-read the document list: ${listError} The list shown is the last one that loaded.`
  const noticeText = actionError ?? refreshFailure

  if (listing.documents.length === 0) {
    return <NoDocuments error={noticeText} entries={entries} />
  }

  const readerState: ReaderState | null = !selected
    ? null
    : readError?.path === selected
      ? { kind: 'failed', path: selected, message: readError.message }
      : document?.path === selected
        ? { kind: 'ready', document }
        : { kind: 'loading', path: selected }

  const showNav = !narrow || pane === 'list'
  const showReader = readerState && (!narrow || pane === 'reader')

  return (
    <div className="ps-docs ps-reading" data-narrow={narrow || undefined}>
      {showNav && (
        <div ref={navRef} style={{ display: 'contents' }}>
          <DocumentNav
            rootPath={rootPath}
            documents={listing.documents}
            folderTitles={listing.folderTitles}
            onSetFolderTitle={setFolderTitle}
            selected={selected}
            onSelect={choose}
            entries={entries}
          />
        </div>
      )}

      {showReader && selected && (
        <DocumentReader
          rootPath={rootPath}
          state={readerState}
          title={listing.documents.find((item) => item.path === selected)?.title ?? selected}
          headingRef={headingRef}
          {...(narrow
            ? {
                onBack: () => {
                  moveFocus.current = true
                  setPane('list')
                },
              }
            : {})}
          notice={
            noticeText && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="orange"
                variant="light"
                mx="md"
                mt="sm"
                withCloseButton
                onClose={() => {
                  setActionError(null)
                  setListError(null)
                }}
              >
                {noticeText}
              </Alert>
            )
          }
          onRetry={() => void read(selected)}
          onReview={(revision) => void review(revision)}
          onOpenExternally={() => void window.knightbook.openDocumentExternally(rootPath, selected)}
          onFollowLink={(request) => onFollowLink(selected, request)}
          // Only the document a link asked for scrolls to the link's heading.
          scrollTo={openTarget?.path === selected ? openTarget.scrollTo : null}
          back={backFor(selected)}
        />
      )}
    </div>
  )
}

function ListFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Center style={{ height: '100%' }}>
      <Alert
        icon={<IconAlertTriangle size={18} />}
        color="orange"
        variant="light"
        title="The document list could not be read"
        w={520}
        maw="100%"
      >
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{message}</Text>
          <Text size="sm" c="var(--ps-text-muted)">
            Nothing was changed. The documents themselves are untouched on disk.
          </Text>
          <Button size="xs" variant="default" onClick={onRetry}>
            Try again
          </Button>
        </Stack>
      </Alert>
    </Center>
  )
}

function NoDocuments({ error, entries }: { error: string | null; entries: ReactNode }) {
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
          <Text size="sm" c="var(--ps-text-muted)">
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
