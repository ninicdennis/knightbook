/**
 * The text matching the board's searches share, for tickets and documents
 * alike, so a query highlights the same way whichever kind of record it hits.
 *
 * Technical design section 9: plain, case-insensitive substring matching. A
 * person typing into a search expects every result to contain what they typed.
 */

/** Where a match sits in a string, so the caller can mark it up. */
export interface Highlight {
  readonly start: number
  readonly length: number
}

const EXCERPT_RADIUS = 90
/** A pathological query against a long body should not produce endless ranges. */
const MAX_HIGHLIGHTS = 20

/**
 * Collapses every run of whitespace to one space. Matching and display both use
 * the collapsed form, which is what keeps a highlight offset meaning the same
 * thing in both: normalizing after finding a match would shift every offset
 * after it.
 */
export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function occurrences(haystack: string, needle: string): Highlight[] {
  if (needle.length === 0) return []

  const found: Highlight[] = []
  const lower = haystack.toLowerCase()
  let from = 0
  while (found.length < MAX_HIGHLIGHTS) {
    const start = lower.indexOf(needle, from)
    if (start === -1) break
    found.push({ start, length: needle.length })
    from = start + needle.length
  }
  return found
}

/** Context around the first match, with an ellipsis wherever text was dropped. */
export function excerptAround(body: string, needle: string): string | null {
  const index = body.toLowerCase().indexOf(needle)
  if (index === -1) return null

  const start = Math.max(0, index - EXCERPT_RADIUS)
  const end = Math.min(body.length, index + needle.length + EXCERPT_RADIUS)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}
