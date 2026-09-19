import { describe, expect, it } from 'vitest'
import { parseRootArgument } from './root.js'

/**
 * Technical design section 4: the root is chosen at setup and bound to the
 * connection. These cover the argument parsing; the tools themselves are
 * exercised end-to-end by the packaging experiment against a real build.
 */

describe('root binding', () => {
  it('reads a separate --root argument', () => {
    expect(parseRootArgument(['--root', 'C:\projects\thing'])).toBe('C:\projects\thing')
  })

  it('reads an inline --root=value argument', () => {
    expect(parseRootArgument(['--root=/home/user/thing'])).toBe('/home/user/thing')
  })

  it('accepts a path containing spaces', () => {
    expect(parseRootArgument(['--root', 'C:\My Projects\thing'])).toBe('C:\My Projects\thing')
  })

  it('refuses to start without a root rather than guessing one', () => {
    expect(() => parseRootArgument([])).toThrow(/--root/)
  })

  it('refuses a --root that swallowed the next flag', () => {
    expect(() => parseRootArgument(['--root', '--verbose'])).toThrow(/requires a folder path/)
  })

  it('refuses an empty inline root', () => {
    expect(() => parseRootArgument(['--root='])).toThrow(/requires a folder path/)
  })
})
