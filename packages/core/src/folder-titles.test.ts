import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { includeDocuments, listIncludedDocuments } from './documents.js'
import { listFolderTitles, setFolderTitle } from './folder-titles.js'
import { withFixtureProject } from './fixture-project.js'
import { reservedPaths } from './paths.js'
import { openProject, type Project } from './project.js'

/**
 * Folder titles are labels in the manifest. They must round-trip, never touch
 * the folders they name, survive alongside metadata this build does not know,
 * and report rather than delete a title whose folder went away.
 */

async function seed(project: Project): Promise<void> {
  await mkdir(join(project.root.path, 'docs', 'experiments'), { recursive: true })
  await writeFile(join(project.root.path, 'docs', 'guide.md'), '# Guide\n', 'utf8')
  await writeFile(join(project.root.path, 'docs', 'experiments', 'a.md'), '# A\n', 'utf8')
}

describe('folder titles', () => {
  it('round-trips through the manifest, nested folders included', async () => {
    await withFixtureProject(async (project) => {
      await seed(project)
      const first = await setFolderTitle(project, 'docs', 'Documentation')
      await setFolderTitle(first, 'docs/experiments/', '  Experiments  ')

      const reopened = await openProject(project.root.path)
      expect(reopened.frontmatter.folder_titles).toEqual({
        docs: 'Documentation',
        'docs/experiments': 'Experiments',
      })
      expect(await listFolderTitles(reopened)).toEqual([
        { path: 'docs', title: 'Documentation', missing: false },
        { path: 'docs/experiments', title: 'Experiments', missing: false },
      ])
    })
  })

  it('renames nothing, and leaves inclusion and listing exactly as they were', async () => {
    await withFixtureProject(async (project) => {
      await seed(project)
      const included = await includeDocuments(project, ['docs'])
      const before = await listIncludedDocuments(included)

      const titled = await setFolderTitle(included, 'docs', 'Documentation')

      expect(await listIncludedDocuments(titled)).toEqual(before)
      expect(titled.frontmatter.documents_include).toEqual(['docs'])
      expect(await readFile(join(project.root.path, 'docs', 'guide.md'), 'utf8')).toBe('# Guide\n')
    })
  })

  it('clears a title with null, removing the map once it is empty', async () => {
    await withFixtureProject(async (project) => {
      await seed(project)
      const titled = await setFolderTitle(project, 'docs', 'Documentation')
      const cleared = await setFolderTitle(titled, 'docs', null)

      expect(cleared.frontmatter.folder_titles).toBeUndefined()
      const source = await readFile(reservedPaths.projectFile(project.root), 'utf8')
      expect(source).not.toContain('folder_titles')
    })
  })

  it('keeps metadata it does not know about', async () => {
    await withFixtureProject(async (project) => {
      await seed(project)
      const file = reservedPaths.projectFile(project.root)
      const source = await readFile(file, 'utf8')
      await writeFile(
        file,
        source.replace('backlog_order: []', 'backlog_order: []\nfuture_field: kept'),
      )

      await setFolderTitle(await openProject(project.root.path), 'docs', 'Documentation')

      expect(await readFile(file, 'utf8')).toContain('future_field: kept')
    })
  })

  it('reports a title whose folder was renamed outside the app, and keeps it', async () => {
    await withFixtureProject(async (project) => {
      await seed(project)
      await setFolderTitle(project, 'docs/experiments', 'Experiments')
      await rename(
        join(project.root.path, 'docs', 'experiments'),
        join(project.root.path, 'docs', 'trials'),
      )

      const reopened = await openProject(project.root.path)
      expect(await listFolderTitles(reopened)).toEqual([
        { path: 'docs/experiments', title: 'Experiments', missing: true },
      ])
      // Clearing it is still possible, deliberately.
      const cleared = await setFolderTitle(reopened, 'docs/experiments', null)
      expect(cleared.frontmatter.folder_titles).toBeUndefined()
    })
  })

  it.each([
    ['a folder that does not exist', 'nowhere', 'Title', 'not_found'],
    ['a file rather than a folder', 'docs/guide.md', 'Title', 'not_found'],
    ['a path outside the project', '../elsewhere', 'Title', 'outside_project'],
    ['the reserved folder', '.projectspace', 'Title', 'outside_project'],
    ['an empty title', 'docs', '   ', 'invalid_path'],
    ['an overlong title', 'docs', 'x'.repeat(81), 'invalid_path'],
  ])('refuses %s', async (_case, folder, title, code) => {
    await withFixtureProject(async (project) => {
      await seed(project)
      const error = await setFolderTitle(project, folder, title).catch((e) => e)
      expect(error.code).toBe(code)
    })
  })

  it('reads a malformed map as no titles, and refuses to write over it', async () => {
    await withFixtureProject(async (project) => {
      await seed(project)
      const file = reservedPaths.projectFile(project.root)
      const source = await readFile(file, 'utf8')
      await writeFile(
        file,
        source.replace('backlog_order: []', 'backlog_order: []\nfolder_titles: [docs]'),
      )

      const reopened = await openProject(project.root.path)
      expect(reopened.frontmatter.folder_titles).toBeUndefined()
      const error = await setFolderTitle(reopened, 'docs', 'Documentation').catch((e) => e)
      expect(error.code).toBe('invalid_record')
      expect(await readFile(file, 'utf8')).toContain('folder_titles: [docs]')
    })
  })
})
