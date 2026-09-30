/**
 * Where a reference in a document points, decided from its text and the file it
 * appears in. Links and images both use this, so a relative path is resolved,
 * decoded and bounded the same way whichever one wrote it. The host checks the
 * result again against the files on disk before anything is opened or shown.
 */

export type LinkTarget =
  /** A path inside the project, resolved from the linking file. */
  | { kind: 'internal'; path: string; fragment: string | null }
  /** A heading in the same file. */
  | { kind: 'anchor'; fragment: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked'; raw: string }

/** Decodes percent-escapes exactly once; malformed escapes are refused, not guessed. */
function decodeOnce(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function classifyLink(href: string, fromPath: string): LinkTarget {
  const trimmed = href.trim()
  if (trimmed.length === 0) return { kind: 'blocked', raw: href }

  if (/^https?:\/\//i.test(trimmed)) return { kind: 'external', url: trimmed }

  // Any other scheme, protocol-relative URL, absolute path, or Windows
  // separator is refused. Markdown links use forward slashes.
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\')
  ) {
    return { kind: 'blocked', raw: trimmed }
  }

  const hashAt = trimmed.indexOf('#')
  const pathPart = hashAt === -1 ? trimmed : trimmed.slice(0, hashAt)
  const rawFragment = hashAt === -1 ? '' : trimmed.slice(hashAt + 1)
  const fragment = rawFragment ? decodeOnce(rawFragment) : null
  if (rawFragment && fragment === null) return { kind: 'blocked', raw: trimmed }

  if (pathPart.length === 0) {
    return fragment ? { kind: 'anchor', fragment } : { kind: 'blocked', raw: trimmed }
  }

  // Resolve relative to the linking file, then reject anything that climbs out
  // of the project. The host validates the result again before opening it.
  const base = fromPath.split('/').slice(0, -1)
  const resolved: string[] = []
  for (const encoded of [...base, ...pathPart.split('/')]) {
    const segment = decodeOnce(encoded)
    // An escaped separator would smuggle in a path the link did not write.
    if (segment === null || segment.includes('/') || segment.includes('\\')) {
      return { kind: 'blocked', raw: trimmed }
    }
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (resolved.length === 0) return { kind: 'blocked', raw: trimmed }
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }

  return resolved.length === 0
    ? { kind: 'blocked', raw: trimmed }
    : { kind: 'internal', path: resolved.join('/'), fragment }
}
