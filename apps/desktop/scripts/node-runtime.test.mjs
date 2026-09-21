// @vitest-environment node
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  archiveFor,
  checksumFor,
  distUrl,
  ensureRuntime,
  hostProvides,
  NODE_VERSION,
  resolveTarget,
} from './node-runtime.mjs'

/**
 * What a release ships has to be decided by the target being built, not by the
 * machine running the build. These cover that decision and the checksum gate;
 * the download itself is exercised separately, against the real nodejs.org, and
 * only when asked for.
 */

describe('choosing a runtime for a target', () => {
  it('names the archive each platform actually publishes', () => {
    expect(archiveFor(resolveTarget('win32', 'x64'), '24.19.0')).toMatchObject({
      file: 'node-v24.19.0-win-x64.zip',
      kind: 'zip',
      binaryName: 'node.exe',
      binaryPath: ['node-v24.19.0-win-x64', 'node.exe'],
    })

    expect(archiveFor(resolveTarget('darwin', 'arm64'), '24.19.0')).toMatchObject({
      file: 'node-v24.19.0-darwin-arm64.tar.gz',
      kind: 'tar.gz',
      binaryName: 'node',
      // The tarball keeps it under bin/, where a zip does not.
      binaryPath: ['node-v24.19.0-darwin-arm64', 'bin', 'node'],
    })
  })

  it('builds every target electron-builder is configured for', () => {
    for (const [platform, arch] of [
      ['win32', 'x64'],
      ['darwin', 'x64'],
      ['darwin', 'arm64'],
      ['linux', 'x64'],
    ]) {
      expect(resolveTarget(platform, arch).key).toBe(`${platform}-${arch}`)
    }
  })

  it('refuses a target it has no runtime for, and says which it has', () => {
    expect(() => resolveTarget('win32', 'arm64')).toThrow(
      /No Node runtime is staged for win32-arm64/,
    )
    expect(() => resolveTarget('freebsd', 'x64')).toThrow(/darwin-arm64/)
  })

  it('uses the build host only when platform, CPU and version all agree', () => {
    const host = resolveTarget(process.platform, process.arch)
    expect(hostProvides(host, process.versions.node)).toBe(true)
    // The same machine running a different Node is not the runtime we ship.
    expect(hostProvides(host, '0.0.1')).toBe(false)

    const other = process.platform === 'darwin' ? 'linux' : 'darwin'
    expect(hostProvides(resolveTarget(other, 'x64'), process.versions.node)).toBe(false)
  })

  it('points at the release directory for the pinned version', () => {
    expect(distUrl('SHASUMS256.txt')).toBe(
      `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`,
    )
  })
})

describe('the checksum gate', () => {
  const SHASUMS = [
    'aaaa1111  node-v24.19.0-darwin-arm64.tar.gz',
    'bbbb2222  node-v24.19.0-win-x64.zip',
    '',
  ].join('\n')

  it('finds the line for the archive being staged', () => {
    expect(checksumFor(SHASUMS, 'node-v24.19.0-win-x64.zip')).toBe('bbbb2222')
  })

  it('fails rather than skipping the check when the archive is not listed', () => {
    expect(() => checksumFor(SHASUMS, 'node-v24.19.0-linux-x64.tar.gz')).toThrow(
      /not listed in SHASUMS256.txt/,
    )
  })

  it('refuses an archive whose bytes do not match, and stages nothing', async () => {
    const cacheDir = join(tmpdir(), `knightbook-runtime-test-${Date.now()}`)
    const target = resolveTarget('linux', 'x64')
    const { file } = archiveFor(target)

    const fetchImpl = async (url) =>
      url.endsWith('SHASUMS256.txt')
        ? { ok: true, status: 200, text: async () => `${'0'.repeat(64)}  ${file}\n` }
        : { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('not node') }

    await expect(ensureRuntime({ target, cacheDir, fetchImpl })).rejects.toThrow(
      /does not match its published checksum/,
    )
    await expect(readFile(join(cacheDir, `v${NODE_VERSION}`, target.key, 'node'))).rejects.toThrow()
  })

  it('reports a download that did not arrive', async () => {
    const target = resolveTarget('linux', 'x64')
    const fetchImpl = async (url) =>
      url.endsWith('SHASUMS256.txt')
        ? { ok: true, status: 200, text: async () => `x  ${archiveFor(target).file}\n` }
        : { ok: false, status: 404, statusText: 'Not Found' }

    await expect(
      ensureRuntime({ target, cacheDir: join(tmpdir(), 'knightbook-runtime-404'), fetchImpl }),
    ).rejects.toThrow(/returned 404 Not Found/)
  })
})

/**
 * The real thing: fetch, verify and unpack a runtime for a platform this machine
 * is not. Off by default because it downloads about 30 MB; set
 * STAGE_RUNTIME_NETWORK=1 to run it.
 */
describe.runIf(process.env['STAGE_RUNTIME_NETWORK'] === '1')('against nodejs.org', () => {
  const cacheDir = join(tmpdir(), `knightbook-runtime-live-${process.pid}`)
  afterAll(async () => await rm(cacheDir, { recursive: true, force: true }))

  it('downloads, verifies and unpacks a runtime for another platform', async () => {
    const target = resolveTarget('linux', 'x64')

    const first = await ensureRuntime({ target, cacheDir })
    expect(first).toContain(target.key)
    const binary = await readFile(first)
    // An ELF executable, so what was unpacked is the Linux binary and not a
    // directory entry or an error page saved under the right name.
    expect([...binary.subarray(0, 4)]).toEqual([0x7f, 0x45, 0x4c, 0x46])

    // The second call must not download again.
    expect(await ensureRuntime({ target, cacheDir })).toBe(first)
  }, 600_000)
})
