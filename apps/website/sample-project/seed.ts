/**
 * `pnpm --filter @knightbook/website sample:project <absolute folder>`: builds Seedling, the fictional sample project,
 * into a new folder. See CAPTURING.md.
 */
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { buildSampleProject } from './build.ts'

const target = process.argv[2]
if (!target) {
  console.error(
    'Usage: pnpm --filter @knightbook/website sample:project <absolute path to an empty folder for the sample project>',
  )
  process.exit(1)
}
const root = resolve(target)
if (await stat(join(root, '.projectspace')).catch(() => null)) {
  console.error(`${root} already has a project. Choose a new folder.`)
  process.exit(1)
}
await buildSampleProject(root)
console.log(`Seedling is ready in ${root}`)
