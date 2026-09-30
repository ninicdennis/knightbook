// @vitest-environment node
import { initializeProject, type Project } from '@knightbook/core'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { readImageView } = await import('./image-ipc.js')

/**
 * What the window receives for an image (ticket 90e1db82), from real files: a
 * data URL holding the bytes, never a path or a file: URL, or the reason it was
 * refused.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-image-ipc-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
  await mkdir(join(project.root.path, 'docs'), { recursive: true })
  await writeFile(join(project.root.path, 'docs', 'logo.png'), PNG)
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('the image the window receives', () => {
  it('is a data URL of the bytes, naming no path', async () => {
    const view = await readImageView(project.root.path, 'docs/logo.png')

    expect(view).toEqual({
      kind: 'image',
      dataUrl: `data:image/png;base64,${PNG.toString('base64')}`,
    })
    expect(JSON.stringify(view)).not.toContain(sandbox.replace(/\\/g, '\\\\'))
    expect(JSON.stringify(view)).not.toMatch(/file:/i)
  })

  it('passes on a refusal with its reason and message', async () => {
    expect(await readImageView(project.root.path, 'docs/gone.png')).toEqual({
      kind: 'unavailable',
      reason: 'not_found',
      message: 'docs/gone.png does not exist in this project.',
    })
  })
})
