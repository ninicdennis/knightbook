import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { packagedCpus, runtimeMismatches, type PackagedBinaries } from './architecture.js'
import { removeWorkspace } from './stage.js'

/**
 * The rule packaged-architecture.test.ts applies to real packages, run here on
 * two fake macOS packages made of Mach-O headers, so the swapped and shared
 * cases it must catch are exercised on any machine, not only on a Mac.
 */

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-architecture-'))
})

afterAll(async () => {
  await removeWorkspace(workspace)
})

const CPU_TYPE = { arm64: 0x0100000c, x64: 0x01000007 }

async function machO(name: string, cpu: keyof typeof CPU_TYPE): Promise<string> {
  const bytes = new Uint8Array(32)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0xfeedfacf, true)
  view.setUint32(4, CPU_TYPE[cpu], true)
  const path = join(workspace, name)
  await writeFile(path, bytes)
  return path
}

async function macPackages(
  armRuntime: keyof typeof CPU_TYPE,
  intelRuntime: keyof typeof CPU_TYPE,
): Promise<PackagedBinaries[]> {
  return [
    {
      name: 'mac-arm64',
      executablePath: await machO('app-arm64', 'arm64'),
      nodePath: await machO(`node-in-arm64-${armRuntime}`, armRuntime),
    },
    {
      name: 'mac',
      executablePath: await machO('app-x64', 'x64'),
      nodePath: await machO(`node-in-x64-${intelRuntime}`, intelRuntime),
    },
  ]
}

describe('checking each package carries a runtime for its own CPU', () => {
  it('passes when each package has its own runtime', async () => {
    expect(await runtimeMismatches(await macPackages('arm64', 'x64'))).toEqual([])
  })

  it('fails when one runtime is shared by both packages', async () => {
    const mismatches = await runtimeMismatches(await macPackages('arm64', 'arm64'))

    expect(mismatches).toEqual([
      'mac: the app is built for x64 but its Node runtime is built for arm64',
    ])
  })

  it('fails for both packages when their runtimes are swapped', async () => {
    expect(await runtimeMismatches(await macPackages('x64', 'arm64'))).toHaveLength(2)
  })

  it('fails rather than passes when a runtime cannot be read', async () => {
    const unreadable = join(workspace, 'not-an-executable')
    await writeFile(unreadable, '#!/bin/sh\n')

    const [armPackage] = await macPackages('arm64', 'x64')
    const mismatches = await runtimeMismatches([{ ...armPackage!, nodePath: unreadable }])

    expect(mismatches).toEqual([
      'mac-arm64: the app is built for arm64 but its Node runtime is built for an unreadable CPU',
    ])
  })
})

describe('listing the CPUs a release packaged', () => {
  it('names each app once, so a missing Intel app shows as a missing entry', async () => {
    const [armPackage, intelPackage] = await macPackages('arm64', 'x64')

    expect(await packagedCpus([intelPackage!.executablePath, armPackage!.executablePath])).toEqual([
      'arm64',
      'x64',
    ])
    expect(await packagedCpus([armPackage!.executablePath])).toEqual(['arm64'])
  })
})
