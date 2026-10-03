import { readFile } from 'node:fs/promises'
import checkedIn from './releases.json'
import { parseReleaseData, type ReleaseData } from './release-data'

/**
 * The release data the site is built with: the checked-in `releases.json`.
 *
 * The tests build the site once per download state, each from a fixture file,
 * and name it with KNIGHTBOOK_RELEASE_DATA_FOR_TESTS. Nothing else sets it; a
 * production build always uses the checked-in file.
 */
export async function loadReleaseData(): Promise<ReleaseData> {
  const fixture = process.env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS
  if (fixture) return parseReleaseData(JSON.parse(await readFile(fixture, 'utf8')), fixture)
  return parseReleaseData(checkedIn)
}
