import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isProjectError } from './errors.js'
import { reservedPaths } from './paths.js'
import { readRecord, writeRecord } from './write.js'
import { withFixtureProject } from '../test/fixture-project.js'

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

  // The loser normally waits a few milliseconds for the lock, then fails the
  // revision check. On a starved machine it can instead wait out the 5s lock
  // timeout and be refused as `locked`. Both are refusals, so both are accepted;
  // what must never happen is two successes, or a failure that is not ours.
  // The test budget is well past the lock timeout, because Vitest's default
  // (also 5s) would otherwise end the test before `locked` could be observed.
  it('serializes concurrent writers instead of losing an update', { timeout: 30_000 }, async () => {
    await withFixtureProject(async (project) => {
      const path = reservedPaths.projectFile(project.root)
      const start = await readRecord(project.root, path)
      const contents = ['writer a', 'writer b']

      const results = await Promise.allSettled(
        contents.map((content) =>
          writeRecord(project.root, path, content, { expectedRevision: start.revision }),
        ),
      )

      const winner = results.findIndex((r) => r.status === 'fulfilled')
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

      const refusal = (results[1 - winner] as PromiseRejectedResult).reason
      expect(isProjectError(refusal)).toBe(true)
      expect(['revision_conflict', 'locked']).toContain(refusal.code)

      // No silent loss: the file holds exactly what the winner was told it wrote.
      const onDisk = await readRecord(project.root, path)
      expect(onDisk.content).toBe(contents[winner])
      expect(onDisk.revision).toBe(
        (results[winner] as PromiseFulfilledResult<{ revision: string }>).value.revision,
      )
    })
  })
})
