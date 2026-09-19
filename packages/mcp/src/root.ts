/**
 * Technical design section 4: the connection is bound to one root chosen at
 * setup, not to a path the model supplies on each call. Project discovery does
 * not grant access to other roots, so the root is read from argv once here and
 * never taken from tool input.
 */
export function parseRootArgument(argv: readonly string[]): string {
  const flagIndex = argv.findIndex((arg) => arg === '--root')
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error('--root requires a folder path')
    }
    return value
  }

  const inline = argv.find((arg) => arg.startsWith('--root='))
  if (inline) {
    const value = inline.slice('--root='.length)
    if (value.length === 0) throw new Error('--root requires a folder path')
    return value
  }

  throw new Error(
    'No project root. Start the server with --root <folder>, the folder chosen during setup.',
  )
}
