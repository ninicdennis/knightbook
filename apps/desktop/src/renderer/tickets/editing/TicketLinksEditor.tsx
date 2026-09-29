import { Alert, Button, Group, Stack } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { ProjectView, Result, TicketDetailView, TicketView } from '../../../shared/contract.js'
import type { DocumentSummary } from '../../../shared/documents-contract.js'
import type { TicketLinksEdit } from '../../../shared/ticket-edit-contract.js'
import { LinkPicker, fileName, matchTitleOrPath, renderDocumentOption } from './LinkPicker.js'

/**
 * A ticket's prerequisites and related documents, edited from its detail view.
 * Until this existed only MCP could change them. Prerequisites are picked by
 * title from the board, never typed as ids, and documents from the ones the
 * workspace includes. What the host refuses (D-032) is explained here, in the
 * dialog, rather than on the board behind it.
 */

type Documents =
  | { kind: 'loading' }
  | { kind: 'ready'; documents: DocumentSummary[] }
  | { kind: 'failed'; message: string }

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'conflict' }
  | { kind: 'refused'; message: string }

interface Props {
  rootPath: string
  ticket: TicketView
  detail: TicketDetailView
  /** Tickets on the board. Archived tickets are not offered as new prerequisites. */
  candidates: TicketView[]
  onSave: (links: TicketLinksEdit, revision: string) => Promise<Result<ProjectView>>
  onDone: () => void
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index])

export function TicketLinksEditor({ rootPath, ticket, detail, candidates, onSave, onDone }: Props) {
  const [dependsOn, setDependsOn] = useState(() => detail.dependencies.map((d) => d.id))
  const [relatedDocuments, setRelatedDocuments] = useState(detail.relatedDocuments)
  const [documents, setDocuments] = useState<Documents>({ kind: 'loading' })
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const container = useRef<HTMLDivElement>(null)

  // It is opened from the footer's Edit menu, which may be far below where it
  // appears, so it brings itself into view.
  useEffect(() => {
    container.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.knightbook.listDocuments(rootPath).then((result) => {
      if (cancelled) return
      setDocuments(
        result.ok
          ? { kind: 'ready', documents: result.value.documents }
          : { kind: 'failed', message: result.message },
      )
    })
    return () => {
      cancelled = true
    }
  }, [rootPath])

  // A reference the ticket already has stays listed so it can be removed, even
  // when it would not be offered now: archived, missing, or no longer included.
  const ticketOptions = [
    ...candidates
      .filter((candidate) => candidate.id !== ticket.id)
      .map((candidate) => ({ value: candidate.id, label: candidate.title })),
    ...detail.dependencies
      .filter((dependency) => !candidates.some((candidate) => candidate.id === dependency.id))
      .map((dependency) => ({
        value: dependency.id,
        label: dependency.title ? `Archived: ${dependency.title}` : `Missing: ${dependency.id}`,
      })),
  ]
  const included = documents.kind === 'ready' ? documents.documents : []
  const documentOptions = [
    ...included.map((document) => ({
      value: document.path,
      label: document.title || fileName(document.path),
    })),
    ...detail.relatedDocuments
      .filter((path) => !included.some((document) => document.path === path))
      .map((path) => ({ value: path, label: `Not included: ${fileName(path)}` })),
  ]

  const unchanged =
    sameList(
      dependsOn,
      detail.dependencies.map((d) => d.id),
    ) && sameList(relatedDocuments, detail.relatedDocuments)

  const save = async () => {
    if (unchanged) return onDone()
    setSaveState({ kind: 'saving' })
    const result = await onSave({ dependsOn, relatedDocuments }, detail.revision)
    if (result.ok) onDone()
    else if (result.code === 'revision_conflict') setSaveState({ kind: 'conflict' })
    else setSaveState({ kind: 'refused', message: result.message })
  }

  return (
    <Stack gap="sm" ref={container}>
      {saveState.kind === 'refused' && (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
          {saveState.message}
        </Alert>
      )}
      {saveState.kind === 'conflict' && (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
          This ticket changed somewhere else, so these links were not saved and nothing was
          overwritten. Load the current version and make the change again.
        </Alert>
      )}
      <LinkPicker
        label="Prerequisites"
        placeholder="Search tickets by title"
        nothingFoundMessage="No ticket on the board has that title."
        data={ticketOptions}
        value={dependsOn}
        onChange={setDependsOn}
      />
      <LinkPicker
        label="Related documents"
        placeholder={
          documents.kind === 'loading' ? 'Reading the documents…' : 'Search included documents'
        }
        disabled={documents.kind !== 'ready'}
        nothingFoundMessage="No included document matches."
        data={documentOptions}
        // Pills show the short title; the list also shows each path, and both are searched.
        renderOption={renderDocumentOption}
        filter={matchTitleOrPath}
        value={relatedDocuments}
        onChange={setRelatedDocuments}
        {...(documents.kind === 'failed'
          ? { error: `The documents could not be listed: ${documents.message}` }
          : {})}
      />
      <Group justify="flex-end" gap="xs">
        {saveState.kind === 'conflict' ? (
          <Button size="xs" onClick={onDone}>
            Load the current version
          </Button>
        ) : (
          <>
            <Button variant="default" size="xs" onClick={onDone}>
              Cancel
            </Button>
            <Button size="xs" loading={saveState.kind === 'saving'} onClick={() => void save()}>
              Save links
            </Button>
          </>
        )}
      </Group>
    </Stack>
  )
}
