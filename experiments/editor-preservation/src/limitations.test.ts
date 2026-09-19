import { describe, expect, it } from 'vitest'
import { loadFixture } from './fixtures.js'
import { roundTripConfigured } from './configured-round-trip.js'

/**
 * Reproduced defects in Milkdown 7.22.1, the latest published release. These
 * assert the broken behavior on purpose: when one starts failing, upstream has
 * fixed it and the editor decision should be revisited. They are a record of
 * what was measured, not an endorsement.
 */

describe('milkdown issue #2428 — inline HTML is silently dropped', () => {
  /**
   * Fix #2463 was merged 2026-08-29, after 7.22.1 shipped on 2026-08-12, so no
   * published release contains it yet. This is content loss with no warning:
   * the two words are joined and the element disappears.
   */
  it('still removes an inline break and joins the surrounding text', async () => {
    const output = await roundTripConfigured(loadFixture('04-regression-br.md'))
    expect(output).toContain('foobar')
    expect(output).not.toContain('<br>')
    expect(output).toContain('A linewith a self-closing break.')
  })
})

describe('milkdown issue #2349 — autolink backslashes multiply', () => {
  /** Does not reproduce on 7.22.1. Backslashes inside autolinks are stable. */
  it('does not reproduce', async () => {
    const source = loadFixture('05-regression-autolink.md')
    const once = await roundTripConfigured(source)
    expect(once).toBe(source)
    expect(await roundTripConfigured(once)).toBe(once)
  })
})

describe('GFM table delimiter rows are narrowed', () => {
  /**
   * Not a remark-gfm option: tablePipeAlign pads to column width, and turning it
   * off emits a single dash. Neither reproduces the conventional three. The
   * output is valid GFM and renders identically, so this is diff noise rather
   * than content loss, and our own editor boundary can restore it on write.
   */
  it('rewrites --- to a single dash', async () => {
    const output = await roundTripConfigured(loadFixture('03-tables-code.md'))
    expect(output).toContain('| - | - | - |')
    expect(output).not.toContain('| --- | --- | --- |')
  })

  it('leaves every table cell value intact', async () => {
    const output = await roundTripConfigured(loadFixture('03-tables-code.md'))
    expect(output).toContain('| `schema_version` | Refuse unsupported versions | yes |')
    expect(output).toContain('| `depends_on` | Prerequisite ticket IDs | no |')
  })
})
