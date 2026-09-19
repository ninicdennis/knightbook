/**
 * Technical design section 10 requires frontmatter to be separated from the
 * editable body rather than rewritten. Milkdown's CommonMark/GFM presets have no
 * frontmatter node, so an unsplit document would be parsed as a thematic break
 * followed by paragraph text. This split is therefore part of the editor
 * boundary, not a test convenience.
 *
 * The blank line between the closing delimiter and the first block is captured
 * with the frontmatter. A Markdown serializer has no way to represent leading
 * body whitespace, so holding it here is what makes a no-op open byte-identical.
 */

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?\r?\n)?---[^\S\r\n]*(\r?\n)?/

export interface SplitDocument {
  /** Original bytes of the frontmatter block, its delimiters, and the gap after it. */
  frontmatter: string
  /** The Markdown body the editor is allowed to parse and serialize. */
  body: string
}

export function splitFrontmatter(source: string): SplitDocument {
  const match = FRONTMATTER_PATTERN.exec(source)
  if (!match) return { frontmatter: '', body: source }

  const blockEnd = match[0].length
  const gap = /^(?:[^\S\r\n]*\r?\n)*/.exec(source.slice(blockEnd))?.[0] ?? ''
  return {
    frontmatter: source.slice(0, blockEnd + gap.length),
    body: source.slice(blockEnd + gap.length),
  }
}

export function joinFrontmatter(split: SplitDocument): string {
  return split.frontmatter + split.body
}
