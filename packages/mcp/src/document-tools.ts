import {
  documentRecordId,
  includeDocuments,
  listIncludedDocuments,
  openProject,
  readDocument,
  readTicket,
  reservedPaths,
  reviewStatus,
  reviewedSource,
  searchProject,
  ticketRecordId,
  writeDocument,
  type Project,
} from '@projectspace/core'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { guard, ok } from './result.js'

/**
 * The document, search, and review half of the section 9 surface.
 *
 * Note what is missing on purpose: there is no tool for an agent to mark content
 * as human-reviewed. Decision D-003 forbids it, so the capability simply does
 * not exist here rather than existing behind an instruction not to use it.
 */

export function registerDocumentTools(server: McpServer, rootPath: string): void {
  const load = async (): Promise<Project> => await openProject(rootPath)

  server.registerTool(
    'documents_include',
    {
      title: 'Include documents',
      description:
        'Register existing Markdown files or folders, in place, so they appear in ' +
        'the workspace. This does not move, copy, or rewrite anything, and it does ' +
        'not add frontmatter to the documents. Paths are relative to the project root.',
      inputSchema: z.object({
        paths: z.array(z.string().min(1)).min(1),
      }),
    },
    async ({ paths }) =>
      await guard(async () => {
        const project = await includeDocuments(await load(), paths)
        return ok({ documents_include: project.frontmatter.documents_include })
      }),
  )

  server.registerTool(
    'documents_list',
    {
      title: 'List documents',
      description:
        'Included documents, resolved to the files they point at now. Entries that ' +
        'no longer resolve are reported as problems rather than omitted silently.',
      inputSchema: z.object({}),
    },
    async () =>
      await guard(async () => {
        const project = await load()
        const listing = await listIncludedDocuments(project)

        const documents = []
        for (const document of listing.documents) {
          documents.push({
            ...document,
            review: await documentReview(project, document.path),
          })
        }
        return ok({ documents, problems: listing.problems })
      }),
  )

  server.registerTool(
    'document_read',
    {
      title: 'Read document',
      description:
        'The original Markdown plus a revision token. Pass that token back to write, ' +
        'so a change made since you read cannot be overwritten.',
      inputSchema: z.object({ path: z.string().min(1) }),
    },
    async ({ path }) =>
      await guard(async () => {
        const project = await load()
        const document = await readDocument(project, path)
        return ok({ ...document, review: await documentReview(project, document.path) })
      }),
  )

  server.registerTool(
    'document_write',
    {
      title: 'Write document',
      description:
        'Save a document in its original location. Requires the revision from your ' +
        'last read. This writes the whole file: preserve what you did not mean to ' +
        'change, including any frontmatter the document already had.',
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
        expected_revision: z.string().min(1),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await load()
        const written = await writeDocument(
          project,
          input.path,
          input.content,
          input.expected_revision,
        )
        return ok({ path: written.path, revision: written.revision })
      }),
  )

  server.registerTool(
    'project_search',
    {
      title: 'Search project',
      description:
        'Bounded text search across included documents and tickets, returning ' +
        'snippets. Use this to find the relevant record instead of reading everything.',
      inputSchema: z.object({ query: z.string().min(1) }),
    },
    async ({ query }) => await guard(async () => ok(await searchProject(await load(), query))),
  )

  server.registerTool(
    'review_status',
    {
      title: 'Review status',
      description:
        'Whether a person has validated this content. Report it accurately and ' +
        'never imply review that has not happened: "unreviewed" and "reviewed" are ' +
        'different from each other and from "changed_since_review". You cannot set ' +
        'this; only the user can, in the app.',
      inputSchema: z.object({
        ticket_id: z.uuid().optional(),
        document_path: z.string().min(1).optional(),
        include_reviewed_source: z.boolean().optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await load()
        if ((input.ticket_id === undefined) === (input.document_path === undefined)) {
          throw new Error('Give exactly one of ticket_id or document_path.')
        }

        const { recordId, source } = input.ticket_id
          ? {
              recordId: ticketRecordId(input.ticket_id),
              source: await ticketSource(project, input.ticket_id),
            }
          : {
              recordId: documentRecordId(project, input.document_path!),
              source: (await readDocument(project, input.document_path!)).content,
            }

        const status = await reviewStatus(project, recordId, source)
        return ok({
          ...status,
          reviewed_source: input.include_reviewed_source
            ? await reviewedSource(project, recordId)
            : undefined,
        })
      }),
  )
}

/**
 * Review compares the file as written, so this reads raw bytes. The record is
 * validated first, so an unparseable ticket reports that rather than silently
 * being fingerprinted as though it were fine.
 */
async function ticketSource(project: Project, id: string): Promise<string> {
  await readTicket(project, id)
  return await readFile(reservedPaths.ticketFile(project.root, id), 'utf8')
}

async function documentReview(project: Project, path: string) {
  try {
    const document = await readDocument(project, path)
    const status = await reviewStatus(project, documentRecordId(project, path), document.content)
    return { state: status.state, last_reviewed_at: status.lastReview?.reviewedAt ?? null }
  } catch {
    return { state: 'unreviewed' as const, last_reviewed_at: null }
  }
}
