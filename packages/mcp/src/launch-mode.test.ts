import { describe, expect, it } from 'vitest'
import { parseLaunchMode } from './launch-mode.js'

/**
 * Access is decided by how the process was launched, never by tool input. These
 * cover the argument parsing; the tools themselves are exercised end-to-end by
 * the packaging experiment against a real build.
 */

describe('a root-bound launch', () => {
  it('reads a separate --root argument', () => {
    const path = String.raw`C:\projects\thing`
    expect(parseLaunchMode(['--root', path])).toEqual({ kind: 'single', root: path })
  })

  it('reads an inline --root=value argument', () => {
    expect(parseLaunchMode(['--root=/home/user/thing'])).toEqual({
      kind: 'single',
      root: '/home/user/thing',
    })
  })

  it('accepts a path containing spaces', () => {
    const path = String.raw`C:\My Projects\thing`
    expect(parseLaunchMode(['--root', path])).toEqual({ kind: 'single', root: path })
  })

  it('refuses a --root that swallowed the next flag', () => {
    expect(() => parseLaunchMode(['--root', '--verbose'])).toThrow(/requires a folder path/)
  })

  it('refuses an empty inline root', () => {
    expect(() => parseLaunchMode(['--root='])).toThrow(/requires a folder path/)
  })
})

describe('a shared launch', () => {
  it('reads the access registry path', () => {
    const path = String.raw`C:\Users\me\AppData\Roaming\Knightbook\mcp-access.json`
    expect(parseLaunchMode(['--registry', path])).toEqual({ kind: 'registry', registry: path })
  })

  it('refuses an empty registry path', () => {
    expect(() => parseLaunchMode(['--registry='])).toThrow(/requires a file path/)
  })
})

describe('an ambiguous or missing launch', () => {
  it('refuses to start without either, rather than guessing a project', () => {
    expect(() => parseLaunchMode([])).toThrow(/--registry.*--root/)
  })

  it('refuses both at once, rather than picking one', () => {
    expect(() => parseLaunchMode(['--root', 'a', '--registry', 'b'])).toThrow(/not both/)
  })
})
