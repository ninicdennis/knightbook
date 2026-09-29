// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'
import { binaryArchitecture } from './binary-architecture.mjs'

/**
 * The staging script end to end for macOS, from any machine: one run must fill
 * a folder per architecture, each with a Node built for that CPU. Off by default
 * because it downloads both macOS runtimes (about 100 MB, then cached); set
 * STAGE_RUNTIME_NETWORK=1 to run it. It needs `pnpm build:mcp` first.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'stage-mcp-runtime.mjs')

describe.runIf(process.env['STAGE_RUNTIME_NETWORK'] === '1')('staging for macOS', () => {
  let out

  afterAll(async () => {
    if (out) await rm(out, { recursive: true, force: true })
  })

  it('stages a separate runtime for each Mac CPU in one run', async () => {
    out = await mkdtemp(join(tmpdir(), 'knightbook-stage-mac-'))

    await promisify(execFile)(process.execPath, [SCRIPT, '--platform=darwin', `--out=${out}`])

    expect(await binaryArchitecture(join(out, 'mcp-arm64', 'node'))).toEqual({
      format: 'mach-o',
      arch: 'arm64',
    })
    expect(await binaryArchitecture(join(out, 'mcp-x64', 'node'))).toEqual({
      format: 'mach-o',
      arch: 'x64',
    })
  }, 600_000)
})
