import { VisuallyHidden } from '@mantine/core'
import { useState } from 'react'
import type { ChangedLineView, ChangeSectionView } from '../../shared/contract.js'

/**
 * One section of a unified line comparison: line numbers on both sides, a sign,
 * and the source text. Unchanged runs longer than the surrounding context fold
 * away behind a button, so a single changed line in a long document is on
 * screen straight away.
 *
 * Every line is React text, never HTML: the source is untrusted, and a diff has
 * to show exactly what is written, markup included.
 */

const CONTEXT = 3

type Row =
  | { type: 'line'; line: ChangedLineView }
  | { type: 'fold'; start: number; lines: ChangedLineView[] }

/** Unchanged lines stay unlabelled, so a screen reader announces only the changes. */
const LABEL: Record<ChangedLineView['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  context: '',
}
const SIGN: Record<ChangedLineView['kind'], string> = { added: '+', removed: '−', context: ' ' }

/** Which lines stay visible: every change, and `CONTEXT` lines either side of one. */
function buildRows(lines: ChangedLineView[], expanded: ReadonlySet<number>): Row[] {
  const visible = lines.map((line) => line.kind !== 'context')
  lines.forEach((line, index) => {
    if (line.kind === 'context') return
    for (let near = index - CONTEXT; near <= index + CONTEXT; near += 1) {
      if (near >= 0 && near < lines.length) visible[near] = true
    }
  })

  const rows: Row[] = []
  let index = 0
  while (index < lines.length) {
    if (visible[index]) {
      rows.push({ type: 'line', line: lines[index]! })
      index += 1
      continue
    }
    const start = index
    while (index < lines.length && !visible[index]) index += 1
    const hidden = lines.slice(start, index)
    // Folding away a single line saves nothing and costs a click.
    if (expanded.has(start) || hidden.length === 1) {
      for (const line of hidden) rows.push({ type: 'line', line })
    } else {
      rows.push({ type: 'fold', start, lines: hidden })
    }
  }
  return rows
}

function describeFold(lines: ChangedLineView[]): string {
  const first = lines[0]?.newNumber
  const last = lines.at(-1)?.newNumber
  const count = `${lines.length} unchanged line${lines.length === 1 ? '' : 's'}`
  return first != null && last != null ? `Show ${count} (${first}–${last})` : `Show ${count}`
}

export function DiffTable({ section, caption }: { section: ChangeSectionView; caption: string }) {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const rows = buildRows(section.lines, expanded)

  return (
    <div className="ps-diff-scroll">
      <table className="ps-diff">
        <caption>
          <VisuallyHidden>{caption}</VisuallyHidden>
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <VisuallyHidden>Reviewed line</VisuallyHidden>
            </th>
            <th scope="col">
              <VisuallyHidden>Current line</VisuallyHidden>
            </th>
            <th scope="col">
              <VisuallyHidden>Change</VisuallyHidden>
            </th>
            <th scope="col">
              <VisuallyHidden>Text</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.type === 'fold' ? (
              <tr key={`fold-${row.start}`} className="ps-diff-fold">
                <td colSpan={4}>
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => new Set(current).add(row.start))}
                  >
                    {describeFold(row.lines)}
                  </button>
                </td>
              </tr>
            ) : (
              <DiffRow
                key={`${row.line.oldNumber ?? ''}:${row.line.newNumber ?? ''}`}
                line={row.line}
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

function DiffRow({ line }: { line: ChangedLineView }) {
  return (
    <tr className={`ps-diff-${line.kind}`} data-bookkeeping={line.bookkeeping || undefined}>
      <td className="ps-diff-number">{line.oldNumber ?? ''}</td>
      <td className="ps-diff-number">{line.newNumber ?? ''}</td>
      <td className="ps-diff-sign">
        <span aria-hidden="true">{SIGN[line.kind]}</span>
        {line.kind !== 'context' && (
          <VisuallyHidden>
            {LABEL[line.kind]}
            {line.bookkeeping ? ', bookkeeping' : ''}
          </VisuallyHidden>
        )}
      </td>
      <td className="ps-diff-text">
        {/* An empty line still needs its height. */}
        {line.text === '' ? '\u00a0' : line.text}
      </td>
    </tr>
  )
}
