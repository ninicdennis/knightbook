import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { heldFilesSync } from './held-files.js'

/**
 * The probe behind "cannot be installed yet". A file another process really
 * holds can only be made on Windows, so that case is checked by hand on an
 * installed build (see the handoff note); these cover what any OS can show.
 */

describe('finding installed files in use', () => {
  it('reports nothing, and changes nothing, when every file can be opened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'held-'))
    const file = join(dir, 'server.mjs')
    writeFileSync(file, 'x')
    const before = statSync(file).mtimeMs

    expect(heldFilesSync(dir, 'win32')).toEqual([])
    expect(statSync(file).mtimeMs).toBe(before)
  })

  it('reports nothing for a folder that is not there', () => {
    expect(heldFilesSync(join(tmpdir(), 'no-such-folder-for-held-files'), 'win32')).toEqual([])
  })

  it('reports nothing on macOS and Linux, which replace a running file without trouble', () => {
    expect(heldFilesSync('/anything', 'darwin')).toEqual([])
    expect(heldFilesSync('/anything', 'linux')).toEqual([])
  })
})
