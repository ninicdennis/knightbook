import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { REPO_ROOT } from './stage.js'

/**
 * What the packaged window leaves behind when a test against it fails.
 *
 * A window test once failed on CI only (Windows, pull request 28): the menu click
 * went through, the ticket file never changed, and the run kept nothing to explain
 * why. The test's workspace is deleted afterwards, so evidence goes to a fixed
 * folder the workflow uploads instead. It is written only on failure.
 */

export const EVIDENCE_DIR = join(REPO_ROOT, 'experiments', 'packaging', 'test-results')

/** Everything the app process writes, collected from launch onwards. */
export interface AppOutput {
  text(): string
}

export function collectAppOutput(electronApp: ElectronApplication): AppOutput {
  const chunks: string[] = []
  const child = electronApp.process()
  child.stdout?.on('data', (data: Buffer) => chunks.push(`[stdout] ${data.toString()}`))
  child.stderr?.on('data', (data: Buffer) => chunks.push(`[stderr] ${data.toString()}`))
  return { text: () => chunks.join('') }
}

/**
 * The visible alerts and each column's count, in words. With one ticket on the
 * board, the column counting 1 is where the card is. The counts are read from
 * their accessible labels ("1 in In progress") rather than from layout, so this
 * keeps working if the columns are restyled.
 */
export async function summarizeWindow(page: Page): Promise<string> {
  const alerts = await page
    .getByRole('alert')
    .allInnerTexts()
    .catch((error: unknown) => [`(alerts could not be read: ${String(error)})`])
  const counts = await page
    .locator('[aria-label]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('aria-label') ?? '')
        .filter((label) => /^\d+ in /.test(label)),
    )
    .catch((error: unknown) => [`(column counts could not be read: ${String(error)})`])

  const alertText = alerts.length
    ? alerts.map((alert) => `"${alert.replace(/\s+/g, ' ').trim()}"`).join('; ')
    : 'none'
  const countText = counts.length ? counts.join(', ') : 'none found'
  return `Alerts showing: ${alertText}. Column counts: ${countText}.`
}

/** Saves a screenshot, the app's output and the window description under one name. */
export async function saveEvidence(
  testName: string,
  page: Page | undefined,
  output: AppOutput | undefined,
): Promise<void> {
  const base = join(EVIDENCE_DIR, testName.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
  await mkdir(EVIDENCE_DIR, { recursive: true })

  const notes: string[] = []
  if (page) {
    await page
      .screenshot({ path: `${base}.png` })
      .catch((error: unknown) => notes.push(`Screenshot failed: ${String(error)}`))
    notes.push(await summarizeWindow(page))
  } else {
    notes.push('The window never opened, so there is no screenshot.')
  }

  const log = output?.text() || '(the app wrote nothing to stdout or stderr)'
  await writeFile(`${base}.log`, `${notes.join('\n')}\n\n${log}\n`, 'utf8')
}
