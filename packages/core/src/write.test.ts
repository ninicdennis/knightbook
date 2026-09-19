import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isProjectError } from './errors.js'
import { reservedPaths } from './paths.js'
import { readRecord, writeRecord } from './write.js'
import { withFixtureProject } from './fixture-project.js'

describe('safe write path', () => {
  it('rejects a write based on a stale revision and reports the current one', async () => {
    await withFixtureProject(async (project) => {
      const path = reservedPaths.projectFile(project.root)
      const first = await readRecord(project.root, path)

      await writeRecord(project.root, path, `${first.content}\nedited once\n`, {
        expectedRevision: first.revision,
      })

      const error = await writeRecord(project.root, path, 'clobbered', {
        expectedRevision: first.revision,
      }).catch((e) => e)

      expect(isProjectError(error)).toBe(true)
      expect(error.code).toBe('revision_conflict')
      expect(error.currentRevision).toBeTruthy()
      expect(error.currentRevision).not.toBe(first.revision)
      expect(await readFile(path, 'utf8')).toContain('edited once')
    })
  })

  it('treats a formatting-only external change as a conflict', async () => {
    await withFixtureProject(async (project) => {
      const path = reservedPaths.projectFile(project.root)
      const before = await readRecord(project.root, path)

      // An external editor adds trailing whitespace and nothing else.
      await writeFile(path, `${before.content} `, 'utf8')

      const error = await writeRecord(project.root, path, 'new content', {
        expectedRevision: before.revision,
      }).catch((e) => e)

      expect(error.code).toBe('revision_conflict')
    })
  })

  it('refuses to create over an existing file', async () => {
    await withFixtureProject(async (project) => {
      const path = reservedPaths.projectFile(project.root)
      const error = await writeRecord(project.root, path, 'x', { mustNotExist: true }).catch(
        (e) => e,
      )
      expect(error.code).toBe('already_exists')
    })
  })

  it('rejects a path that escapes the project', async () => {
    await withFixtureProject(async (project) => {
      const outside = `${project.root.path}/../escaped.md`
      const error = await writeRecord(project.root, outside, 'x', { mustNotExist: true }).catch(
        (e) => e,
      )
      expect(error.code).toBe('outside_project')
    })
  })

  it('serializes concurrent writers instead of losing an update', async () => {
    await withFixtureProject(async (project) => {
      const path = reservedPaths.projectFile(project.root)
      const start = await readRecord(project.root, path)

      const results = await Promise.allSettled([
        writeRecord(project.root, path, 'writer a', { expectedRevision: start.revision }),
        writeRecord(project.root, path, 'writer b', { expectedRevision: start.revision }),
      ])

      const succeeded = results.filter((r) => r.status === 'fulfilled')
      expect(succeeded).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected')
      expect((rejected as PromiseRejectedResult).reason.code).toBe('revision_conflict')
    })
  })
})
