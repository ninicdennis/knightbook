import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A fresh folder for a test's Astro build, inside the website's own
 * `node_modules/.cache` rather than the system temp folder. Astro moves built
 * assets into the output folder with a rename, which fails with EXDEV when the
 * two are on different drives, as the repository (D:) and the temp folder (C:)
 * are on GitHub's Windows runners.
 */
const ROOT = fileURLToPath(new URL('../../node_modules/.cache/knightbook-tests', import.meta.url))

export async function buildTempDir(prefix: string): Promise<string> {
  await mkdir(ROOT, { recursive: true })
  return await mkdtemp(join(ROOT, prefix))
}
