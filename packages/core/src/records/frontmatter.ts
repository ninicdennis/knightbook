import { Document, parseDocument } from 'yaml'
import { ProjectError } from './errors.js'

/**
 * Technical design section 2: edit owned metadata fields through the YAML
 * Document API so unknown fields survive, rather than reconstructing a
 * restricted object. Section 3 adds that unsupported schema versions must be
 * refused without rewriting the file.
 *
 * The trailing gap after the closing delimiter is kept with the frontmatter for
 * the same reason the editor experiment keeps it: nothing downstream can
 * reproduce leading body whitespace, so holding it here is what makes an
 * unchanged read/write round trip byte-identical.
 */

const BLOCK = /^---\r?\n([\s\S]*?\r?\n)?---[^\S\r\n]*(\r?\n)?/
const GAP = /^(?:[^\S\r\n]*\r?\n)*/

export const SUPPORTED_SCHEMA_VERSION = 1

export interface ParsedRecord {
  /** Parsed frontmatter, editable in place. Empty document when the file had none. */
  readonly data: Document
  /** Markdown body after the frontmatter block and its trailing gap. */
  readonly body: string
  /** Whether the source actually carried a frontmatter block. */
  readonly hadFrontmatter: boolean
  /** Exact newline sequence the source used, so a rewrite does not change it. */
  readonly eol: '\n' | '\r\n'
}

export function parseRecord(source: string): ParsedRecord {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const match = BLOCK.exec(source)
  if (!match) {
    return { data: new Document({}), body: source, hadFrontmatter: false, eol }
  }

  const blockEnd = match[0].length
  const gap = GAP.exec(source.slice(blockEnd))?.[0] ?? ''
  const yamlText = match[1] ?? ''
  const data = parseDocument(yamlText, { keepSourceTokens: true })

  if (data.errors.length > 0) {
    throw new ProjectError(
      'invalid_record',
      `Frontmatter is not valid YAML: ${data.errors[0]?.message ?? 'unknown error'}`,
    )
  }

  return { data, body: source.slice(blockEnd + gap.length), hadFrontmatter: true, eol }
}

export function serializeRecord(record: ParsedRecord, body?: string): string {
  const yamlText = record.data.toString({ lineWidth: 0 }).trimEnd()
  const nextBody = body ?? record.body
  return `---${record.eol}${yamlText}${record.eol}---${record.eol}${record.eol}${nextBody}`
}

export function readField<T>(record: ParsedRecord, key: string): T | undefined {
  const value = record.data.get(key)
  return value === undefined || value === null ? undefined : (value as T)
}

export function requireField<T>(record: ParsedRecord, key: string): T {
  const value = readField<T>(record, key)
  if (value === undefined) {
    throw new ProjectError('invalid_record', `Required field is missing: ${key}`)
  }
  return value
}

/** Refuses a record written by a newer schema instead of rewriting it. */
export function assertSupportedSchema(record: ParsedRecord): void {
  const version = readField<number>(record, 'schema_version')
  if (version === undefined) {
    throw new ProjectError('invalid_record', 'Record is missing schema_version')
  }
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new ProjectError('invalid_record', `schema_version must be an integer, got ${version}`)
  }
  if (version > SUPPORTED_SCHEMA_VERSION) {
    throw new ProjectError(
      'unsupported_schema_version',
      `Record uses schema_version ${version}; this build supports ${SUPPORTED_SCHEMA_VERSION}. ` +
        'The file was left unchanged.',
    )
  }
}

/** Conflict markers mean Git left the file mid-merge; app writes must stop. */
export function assertNoConflictMarkers(source: string, path: string): void {
  if (/^<{7} |^={7}$|^>{7} /m.test(source)) {
    throw new ProjectError(
      'invalid_record',
      `${path} contains unresolved merge conflict markers. Resolve them before editing here.`,
    )
  }
}
