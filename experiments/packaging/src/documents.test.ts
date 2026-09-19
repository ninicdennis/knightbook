import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, callExpectingError, connect } from './client.js'
import { stageResources, type StagedResources } from './stage.js'

/**
 * Validation scenarios 14 and 15: a project with its own document hierarchy,
 * existing files included in place without being moved or rewritten, and an edit
 * that reaches the original file. Driven through the packaged server over stdio,
 * because that is the path an AI tool actually takes.
 */

const README = '# Existing app\n\nWritten long before this project existed.\n'
const ARCHITECTURE = '# Architecture\n\nThe resolver rejects traversal outside the root.\n'

let workspace: string
let resources: StagedResources
let projectRoot: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'projectspace-documents-'))
  resources = await stageResources(join(workspace, 'resources'))
  projectRoot = join(workspace, 'existing-app')

  // An application that already exists, with documentation of its own.
  await mkdir(join(projectRoot, 'docs'), { recursive: true })
  await writeFile(join(projectRoot, 'README.md'), README, 'utf8')
  await writeFile(join(projectRoot, 'docs', 'architecture.md'), ARCHITECTURE, 'utf8')
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('onboarding an application that already exists', () => {
  it('creates a project without disturbing what is already there', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      await call(connection, 'project_initialize', { name: 'Existing App' })

      expect(await readFile(join(projectRoot, 'README.md'), 'utf8')).toBe(README)
      expect(await readFile(join(projectRoot, 'docs', 'architecture.md'), 'utf8')).toBe(
        ARCHITECTURE,
      )
    } finally {
      await connection.close()
    }
  })

  it('includes existing files in place, without copying or rewriting them', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const included = await call(connection, 'documents_include', {
        paths: ['README.md', 'docs'],
      })
      expect(included['documents_include']).toEqual(['README.md', 'docs'])

      const listing = await call(connection, 'documents_list')
      const documents = listing['documents'] as Array<Record<string, unknown>>
      expect(documents.map((d) => d['path'])).toEqual(['README.md', 'docs/architecture.md'])

      // Unchanged on disk, and no duplicate copied anywhere.
      expect(await readFile(join(projectRoot, 'README.md'), 'utf8')).toBe(README)
    } finally {
      await connection.close()
    }
  })

  it('reports generated content as unreviewed rather than implying validation', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const listing = await call(connection, 'documents_list')
      const documents = listing['documents'] as Array<Record<string, unknown>>
      for (const document of documents) {
        expect((document['review'] as Record<string, unknown>)['state']).toBe('unreviewed')
      }

      const status = await call(connection, 'review_status', { document_path: 'README.md' })
      expect(status['state']).toBe('unreviewed')
      expect(status['lastReview']).toBeNull()
    } finally {
      await connection.close()
    }
  })

  it('offers no way for an agent to mark content human-reviewed', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const { tools } = await connection.client.listTools()
      const names = tools.map((t) => t.name)

      expect(names).toContain('review_status')
      // Decision D-003: the capability does not exist, rather than existing
      // behind an instruction not to use it.
      expect(names.some((n) => /review_(record|set|mark|approve)/.test(n))).toBe(false)
    } finally {
      await connection.close()
    }
  })
})

describe('editing an included document', () => {
  it('writes through to the original file and rejects a stale revision', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const before = await call(connection, 'document_read', { path: 'docs/architecture.md' })
      expect(before['content']).toBe(ARCHITECTURE)

      await call(connection, 'document_write', {
        path: 'docs/architecture.md',
        content: `${ARCHITECTURE}\nSymlinks that escape the root are rejected too.\n`,
        expected_revision: before['revision'],
      })

      const onDisk = await readFile(join(projectRoot, 'docs', 'architecture.md'), 'utf8')
      expect(onDisk).toContain('Symlinks that escape the root')

      const conflict = await callExpectingError(connection, 'document_write', {
        path: 'docs/architecture.md',
        content: 'clobbered',
        expected_revision: before['revision'],
      })
      expect(conflict).toContain('revision_conflict')
      expect(await readFile(join(projectRoot, 'docs', 'architecture.md'), 'utf8')).toBe(onDisk)
    } finally {
      await connection.close()
    }
  })

  it('refuses a path that escapes the project', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const refused = await callExpectingError(connection, 'document_read', {
        path: '../resources/mcp/server.mjs',
      })
      expect(refused).toContain('outside_project')
    } finally {
      await connection.close()
    }
  })
})

describe('finding content without reading everything', () => {
  it('returns snippets across documents and tickets', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      await call(connection, 'ticket_create', {
        title: 'Harden path resolution',
        body: '# Harden path resolution\n\nReject traversal and escaping symlinks.\n',
      })

      const result = await call(connection, 'project_search', { query: 'traversal' })
      const hits = result['hits'] as Array<Record<string, unknown>>

      expect(hits.length).toBeGreaterThanOrEqual(2)
      expect(hits.some((h) => h['kind'] === 'document')).toBe(true)
      expect(hits.some((h) => h['kind'] === 'ticket')).toBe(true)
      expect(hits.every((h) => typeof h['snippet'] === 'string')).toBe(true)
    } finally {
      await connection.close()
    }
  })
})
