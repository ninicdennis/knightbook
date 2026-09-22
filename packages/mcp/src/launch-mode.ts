/**
 * How this process was told which projects it may reach. Read from argv once and
 * never from tool input, so a model cannot widen its own access.
 *
 * - `--root <folder>`: the original connection, bound to exactly one checkout.
 *   Kept working as it always has, and never widened.
 * - `--registry <file>`: the shared connection. It reaches whichever checkouts the
 *   user has enabled in the app's access list, re-read on every call, and every
 *   project tool names its target explicitly.
 */
export type LaunchMode =
  | { readonly kind: 'single'; readonly root: string }
  | { readonly kind: 'registry'; readonly registry: string }

export function parseLaunchMode(argv: readonly string[]): LaunchMode {
  const root = readFlag(argv, '--root', 'a folder path')
  const registry = readFlag(argv, '--registry', 'a file path')

  if (root !== null && registry !== null) {
    throw new Error(
      'Give either --root (one project) or --registry (every project enabled in the app), not both.',
    )
  }
  if (root !== null) return { kind: 'single', root }
  if (registry !== null) return { kind: 'registry', registry }
  throw new Error(
    'No project access given. Start the server with the configuration the Knightbook app ' +
      'copies: --registry <file> for enabled projects, or --root <folder> for one project.',
  )
}

function readFlag(argv: readonly string[], flag: string, what: string): string | null {
  const flagIndex = argv.findIndex((arg) => arg === flag)
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires ${what}`)
    return value
  }

  const inline = argv.find((arg) => arg.startsWith(`${flag}=`))
  if (inline) {
    const value = inline.slice(flag.length + 1)
    if (value.length === 0) throw new Error(`${flag} requires ${what}`)
    return value
  }
  return null
}
