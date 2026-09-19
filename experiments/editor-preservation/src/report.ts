/**
 * Prints the preservation evidence technical design section 11 asks for, for
 * both Milkdown's default serializer settings and a serializer configured to
 * match the conventions our documents already use. The difference between the
 * two columns is what configuration can fix; what remains is what cannot.
 */
import { loadFixtures } from './fixtures.js'
import { roundTripDocument } from './round-trip.js'
import { roundTripConfigured } from './configured-round-trip.js'

interface Result {
  name: string
  defaultIdentical: boolean
  configuredIdentical: boolean
  stable: boolean
  droppedMarkup: string[]
  firstDiff: { line: number; before: string; after: string } | null
}

/** Markup present in the source that is gone from the output entirely. */
const MARKUP_PATTERNS: Array<[string, RegExp]> = [
  ['<br>', /<br\s*\/?>/],
  ['raw HTML block', /<div[\s\S]*?<\/div>/],
  ['directive', /^:::/m],
  ['footnote', /\[\^1\]/],
  ['math block', /\$\$/],
]

function findDroppedMarkup(before: string, after: string): string[] {
  return MARKUP_PATTERNS.filter(
    ([, pattern]) => pattern.test(before) && !pattern.test(after),
  ).map(([label]) => label)
}

function firstDifference(before: string, after: string) {
  const a = before.split('\n')
  const b = after.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return { line: i + 1, before: a[i] ?? '(end of file)', after: b[i] ?? '(end of file)' }
    }
  }
  return null
}

async function main(): Promise<void> {
  const results: Result[] = []
  for (const fixture of loadFixtures()) {
    const asShipped = await roundTripDocument(fixture.source)
    const configured = await roundTripConfigured(fixture.source)
    const twice = await roundTripConfigured(configured)
    results.push({
      name: fixture.name,
      defaultIdentical: asShipped === fixture.source,
      configuredIdentical: configured === fixture.source,
      stable: twice === configured,
      droppedMarkup: findDroppedMarkup(fixture.source, configured),
      firstDiff: firstDifference(fixture.source, configured),
    })
  }

  console.log('\nMilkdown 7.22.1 (latest published, 2026-08-12) — preservation evidence')
  console.log('Byte-identical no-op open, by serializer configuration:\n')
  console.log('fixture                     defaults  configured  stable  markup dropped')
  console.log('-'.repeat(78))
  for (const r of results) {
    console.log(
      [
        r.name.padEnd(27),
        (r.defaultIdentical ? 'yes' : 'NO').padEnd(9),
        (r.configuredIdentical ? 'yes' : 'NO').padEnd(11),
        (r.stable ? 'yes' : 'NO').padEnd(7),
        r.droppedMarkup.length === 0 ? 'none' : r.droppedMarkup.join(', '),
      ].join(' '),
    )
  }

  console.log('\nRemaining differences with the configured serializer:\n')
  for (const r of results) {
    if (r.configuredIdentical || !r.firstDiff) continue
    console.log(`  ${r.name} (first differs at line ${r.firstDiff.line})`)
    console.log(`    source: ${JSON.stringify(r.firstDiff.before)}`)
    console.log(`    output: ${JSON.stringify(r.firstDiff.after)}`)
  }

  const lossy = results.filter((r) => r.droppedMarkup.length > 0)
  const fixedByConfig = results.filter((r) => !r.defaultIdentical && r.configuredIdentical)
  console.log(
    `\n${results.length} fixtures. Configuration made ${fixedByConfig.length} byte-identical. ` +
      `${lossy.length} still drop markup and cannot be fixed by configuration.\n`,
  )
}

await main()
