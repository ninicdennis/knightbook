import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, readProjectImage, sniffImageType } from './images.js'
import { withFixtureProject } from '../test/fixture-project.js'
import type { Project } from '../records/project.js'

/**
 * Showing an in-project image (ticket 90e1db82). Every refusal here is a case a
 * document could use to make the app read something it should not.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1')
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

async function withImages(run: (project: Project) => Promise<void>): Promise<void> {
  await withFixtureProject(async (project) => {
    const docs = join(project.root.path, 'docs', 'assets')
    await mkdir(docs, { recursive: true })
    await writeFile(join(docs, 'logo.png'), PNG)
    await writeFile(join(docs, 'photo.jpg'), JPEG)
    await writeFile(join(docs, 'spinner.gif'), GIF)
    await writeFile(join(docs, 'shot.webp'), WEBP)
    await writeFile(join(docs, 'icon.svg'), SVG)
    await writeFile(join(docs, 'renamed.png'), SVG)
    await run(project)
  })
}

describe('readProjectImage', () => {
  it('reads an in-project PNG with its type taken from the bytes', async () => {
    await withImages(async (project) => {
      const image = await readProjectImage(project, 'docs/assets/logo.png')

      expect(image).toMatchObject({ kind: 'image', mediaType: 'image/png' })
      expect(image.kind === 'image' && image.bytes.equals(PNG)).toBe(true)
    })
  })

  it('reads JPEG, GIF and WebP', async () => {
    await withImages(async (project) => {
      expect(await readProjectImage(project, 'docs/assets/photo.jpg')).toMatchObject({
        mediaType: 'image/jpeg',
      })
      expect(await readProjectImage(project, 'docs/assets/spinner.gif')).toMatchObject({
        mediaType: 'image/gif',
      })
      expect(await readProjectImage(project, 'docs/assets/shot.webp')).toMatchObject({
        mediaType: 'image/webp',
      })
    })
  })

  it('refuses SVG, and a file named .png that is not one', async () => {
    await withImages(async (project) => {
      for (const path of ['docs/assets/icon.svg', 'docs/assets/renamed.png']) {
        expect(await readProjectImage(project, path)).toMatchObject({
          kind: 'unavailable',
          reason: 'unsupported_type',
        })
      }
    })
  })

  it('refuses a path that climbs out of the project', async () => {
    await withImages(async (project) => {
      expect(await readProjectImage(project, '../outside.png')).toMatchObject({
        kind: 'unavailable',
        reason: 'outside_project',
      })
      expect(await readProjectImage(project, 'C:/Windows/logo.png')).toMatchObject({
        reason: 'outside_project',
      })
    })
  })

  it('refuses a symlink that leads out of the project', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'knightbook-image-outside-'))
    try {
      await writeFile(join(outside, 'secret.png'), PNG)
      await withImages(async (project) => {
        try {
          await symlink(outside, join(project.root.path, 'docs', 'escape'), 'junction')
        } catch {
          return // Creating links can need privileges this machine lacks.
        }
        expect(await readProjectImage(project, 'docs/escape/secret.png')).toMatchObject({
          kind: 'unavailable',
          reason: 'outside_project',
        })
      })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses an image over the size cap, saying how large it is', async () => {
    await withImages(async (project) => {
      const big = Buffer.alloc(MAX_IMAGE_BYTES + 1)
      PNG.copy(big)
      await writeFile(join(project.root.path, 'docs', 'assets', 'huge.png'), big)

      const image = await readProjectImage(project, 'docs/assets/huge.png')

      expect(image).toMatchObject({ kind: 'unavailable', reason: 'too_large' })
      expect(image.kind === 'unavailable' && image.message).toMatch(/5\.0 MB limit/)
    })
  })

  it('says a missing image is missing, and refuses the app records folder', async () => {
    await withImages(async (project) => {
      expect(await readProjectImage(project, 'docs/assets/gone.png')).toMatchObject({
        reason: 'not_found',
      })
      expect(await readProjectImage(project, 'docs/assets')).toMatchObject({
        reason: 'not_found',
      })
      expect(await readProjectImage(project, '.projectspace/project.yml')).toMatchObject({
        reason: 'reserved',
      })
    })
  })

  it('changes nothing on disk and records no review', async () => {
    await withImages(async (project) => {
      const file = join(project.root.path, 'docs', 'assets', 'logo.png')
      const before = await stat(file)
      // Names and bytes: a review written into an existing record would change
      // its contents, not the list of files.
      const records = async () => {
        const dir = join(project.root.path, '.projectspace')
        const entries = await readdir(dir, { recursive: true, withFileTypes: true })
        const contents: Record<string, string> = {}
        for (const entry of entries.filter((candidate) => candidate.isFile())) {
          const path = join(entry.parentPath, entry.name)
          contents[path] = await readFile(path, 'utf8')
        }
        return contents
      }
      const recordsBefore = await records()

      await readProjectImage(project, 'docs/assets/logo.png')

      expect((await stat(file)).mtimeMs).toBe(before.mtimeMs)
      expect(await records()).toEqual(recordsBefore)
    })
  })
})

describe('sniffImageType', () => {
  it('knows nothing from too few bytes', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull()
    expect(sniffImageType(new Uint8Array(0))).toBeNull()
  })
})
