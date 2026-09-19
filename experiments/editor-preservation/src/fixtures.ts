import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

export interface Fixture {
  name: string
  source: string
}

export function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({ name, source: readFileSync(join(FIXTURE_DIR, name), 'utf8') }))
}

export function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
}
