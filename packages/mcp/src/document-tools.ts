import {
  createDocument,
  documentRecordId,
  includeDocuments,
  listFolderTitles,
  listIncludedDocuments,
  readDocument,
  readTicket,
  removeFromWorkspace,
  reservedPaths,
  reviewStatus,
  reviewedSource,
  searchProject,
  ticketRecordId,
  writeDocument,
  type Project,
} from '@knightbook/core'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { guard, ok, type ToolResult } from './result.js'
import type { ProjectScope } from './scope.js'

/**
 * The document, search, and review half of the section 9 surface.
 *
 * Note what is missing on purpose: there is no tool for an agent to mark content
 * as human-reviewed. Decision D-003 forbids it, so the capability simply does
 * not exist here rather than existing behind an instruction not to use it.
 */

export function registerDocumentTools(server: McpServer, scope: ProjectScope): void {
  const echo = (project: Project, input: object, value: object): ToolResult =>
    ok(scope.echo(project, input, value))

  server.registerTool(
    'documents_include',
    {
      title: 'Include documents',
      description:
        'Register existing Markdown files or folders, in place, so they appear in ' +
        'the workspace. This does not move, copy, or rewrite anything, and it does ' +
        'not add frontmatter to the documents. Paths are relative to the project root.',
      inputSchema: z.object({
        ...scope.shape,
        paths: z.array(z.string().min(1)).min(1),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await includeDocuments(await scope.open(input), input.paths)
        return echo(project, input, { documents_include: project.frontmatter.documents_include })
      }),
  )

  server.registerTool(
    'documents_remove',
    {
      title: 'Remove a document from the workspace',
      description:
        'Drop one entry from the project manifest. The file itself is left exactly ' +
        'where it is on disk: this un-includes a document, it does not delete one. ' +
        'Pass the entry as it appears in documents_include, which for a document ' +
        'inside an included folder is the folder, not the file.',
      inputSchema: z.object({ ...scope.shape, path: z.string().min(1) }),
    },
    async (input) =>
      await guard(async () => {
        const project = await removeFromWorkspace(await scope.open(input), input.path)
        return echo(project, input, { documents_include: project.frontmatter.documents_include })
      }),
  )

  server.registerTool(
    'documents_list',
    {
      title: 'List documents',
      description:
        'Included documents, resolved to the files they point at now. Entries that ' +
        'no longer resolve are reported as problems rather than omitted silently. ' +
        'folder_titles are the names the user gave document folders in the app; a ' +
        'title renames nothing, and missing: true means that folder no longer exists.',
      inputSchema: z.object({ ...scope.shape }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const listing = await listIncludedDocuments(project)

        const documents = []
        for (const document of listing.documents) {
          documents.push({
            ...document,
            review: await documentReview(project, document.path),
          })
        }
        return echo(project, input, {
          documents,
          problems: listing.problems,
          folder_titles: await listFolderTitles(project),
        })
      }),
  )

  server.registerTool(
    'document_read',
    {
      title: 'Read document',
      description:
        'The original Markdown plus a revision token. Pass that token back to write, ' +
        'so a change made since you read cannot be overwritten.',
      inputSchema: z.object({ ...scope.shape, path: z.string().min(1) }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const document = await readDocument(project, input.path)
        return echo(project, input, {
          ...document,
          review: await documentReview(project, document.path),
        })
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
        ...scope.shape,
        path: z.string().min(1),
        content: z.string(),
        expected_revision: z.string().min(1),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const written = await writeDocument(
          project,
          input.path,
          input.content,
          input.expected_revision,
        )
        return echo(project, input, { path: written.path, revision: written.revision })
      }),
  )

  server.registerTool(
    'document_create',
    {
      title: 'Create document',
      description:
        'Create a new Markdown (.md) document at a project-relative path and include it ' +
        'in the workspace. Missing folders are created. This never overwrites: if the ' +
        'file already exists it fails with already_exists, and you should document_read ' +
        'and document_write it instead. The content is written exactly as given; there ' +
        'are no templates and no required sections.',
      inputSchema: z.object({
        ...scope.shape,
        path: z.string().min(1),
        content: z.string(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const created = await createDocument(await scope.open(input), input.path, input.content)
        return echo(created.project, input, {
          path: created.document.path,
          revision: created.document.revision,
          included_via: created.document.includedVia,
        })
      }),
  )

  server.registerTool(
    'project_search',
    {
      title: 'Search project',
      description:
        'Bounded text search across included documents and tickets, returning ' +
        'snippets. Use this to find the relevant record instead of reading everything.',
      inputSchema: z.object({ ...scope.shape, query: z.string().min(1) }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        return echo(project, input, await searchProject(project, input.query))
      }),
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
        ...scope.shape,
        ticket_id: z.uuid().optional(),
        document_path: z.string().min(1).optional(),
        include_reviewed_source: z.boolean().optional(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
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
        return echo(project, input, {
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
