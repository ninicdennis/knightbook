import { createHash } from 'node:crypto'

/**
 * Technical design section 7 requires two separate comparisons. This is the raw
 * one: a hash of exact file bytes, used to detect that a caller is writing based
 * on content it read before someone else changed it. Formatting-only differences
 * must still produce a conflict here, so this deliberately hashes bytes rather
 * than parsed structure.
 */
export type Revision = string

export function revisionOf(bytes: Buffer | string): Revision {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes
  return createHash('sha256').update(buffer).digest('hex').slice(0, 32)
}
