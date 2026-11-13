import { describe, expect, it, vi } from 'vitest'
import type { UpdateMode } from '../../shared/updates-contract.js'
import { UpdateService, type InPlaceUpdater } from './update-service.js'

/**
 * The update flow's states (D-056), with GitHub, electron-updater and the
 * installed files stood in for. What a real installer does is checked by hand
 * on an installed build; see the handoff note.
 */

const RELEASES = [
  {
    tag_name: 'v0.4.0',
    name: 'Knightbook 0.4.0',
    draft: false,
    html_url: 'https://github.com/ninicdennis/knightbook/releases/tag/v0.4.0',
    assets: [{ name: 'latest.yml' }],
  },
]

function fakeUpdater(overrides: Partial<InPlaceUpdater> = {}): InPlaceUpdater {
  return {
    prepare: vi.fn().mockResolvedValue('0.4.0'),
    download: vi.fn().mockImplementation(async (progress: (p: number) => void) => progress(50.4)),
    quitAndInstall: vi.fn(),
    setInstallOnQuit: vi.fn(),
    ...overrides,
  }
}

function service(
  options: {
    mode?: UpdateMode
    releases?: () => Promise<unknown>
    updater?: InPlaceUpdater | null
    held?: () => string[]
    settle?: () => Promise<void>
  } = {},
) {
  const updater = options.updater === undefined ? fakeUpdater() : options.updater
  const fetchReleases = vi.fn(options.releases ?? (async () => RELEASES))
  const heldFiles = vi.fn(options.held ?? (() => []))
  const settleSaves = vi.fn(options.settle ?? (async () => undefined))
  const updates = new UpdateService({
    currentVersion: '0.3.1',
    mode: options.mode ?? 'install',
    fetchReleases,
    updater,
    heldFiles,
    settleSaves,
    now: () => new Date('2026-11-13T12:00:00Z'),
  })
  return { updates, updater, fetchReleases, heldFiles, settleSaves }
}

describe('checking', () => {
  it('reports a newer release as available and downloads nothing', async () => {
    const { updates, updater } = service()
    const view = await updates.check()

    expect(view.status).toMatchObject({ phase: 'available', release: { version: '0.4.0' } })
    expect(updater!.prepare).not.toHaveBeenCalled()
    expect(updater!.download).not.toHaveBeenCalled()
  })

  it('says up to date, with the time, when nothing is newer', async () => {
    const { updates } = service({ releases: async () => [] })
    expect((await updates.check()).status).toEqual({
      phase: 'up-to-date',
      checkedAt: '2026-11-13T12:00:00.000Z',
    })
  })

  it('reports an offline or refused check as a failure, never as up to date', async () => {
    const offline = service({
      releases: async () => Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')),
    })
    const status = (await offline.updates.check()).status
    expect(status).toMatchObject({ phase: 'failed', stage: 'check' })
    expect(JSON.stringify(status)).toContain('ERR_INTERNET_DISCONNECTED')

    const limited = service({ releases: async () => ({ message: 'API rate limit exceeded' }) })
    expect((await limited.updates.check()).status).toMatchObject({
      phase: 'failed',
      stage: 'check',
    })
  })

  it('never checks from a build that is not an installed release', async () => {
    const { updates, fetchReleases } = service({ mode: 'off' })
    expect((await updates.check()).status).toEqual({ phase: 'idle' })
    expect(fetchReleases).not.toHaveBeenCalled()
  })

  it('tells every listener about each change', async () => {
    const { updates } = service()
    const seen: string[] = []
    updates.onChange((view) => seen.push(view.status.phase))
    await updates.check()
    expect(seen).toEqual(['checking', 'available'])
  })
})

describe('downloading, only when asked', () => {
  it('downloads the offered release from its own release folder and becomes ready', async () => {
    const { updates, updater } = service()
    await updates.check()
    const view = await updates.download()

    expect(updater!.prepare).toHaveBeenCalledWith(
      'https://github.com/ninicdennis/knightbook/releases/download/v0.4.0/',
    )
    expect(view.status).toMatchObject({ phase: 'ready', release: { version: '0.4.0' } })
    expect(updater!.setInstallOnQuit).toHaveBeenCalledWith(true)
  })

  it('reports progress while bytes arrive', async () => {
    const { updates } = service()
    const percents: (number | null)[] = []
    updates.onChange((view) => {
      if (view.status.phase === 'downloading') percents.push(view.status.percent)
    })
    await updates.check()
    await updates.download()
    expect(percents).toEqual([null, 50])
  })

  it('refuses a release whose update file names another version', async () => {
    const { updates, updater } = service({
      updater: fakeUpdater({ prepare: vi.fn().mockResolvedValue('0.3.9') }),
    })
    await updates.check()
    const status = (await updates.download()).status

    expect(status).toMatchObject({ phase: 'failed', stage: 'download' })
    expect(JSON.stringify(status)).toContain('0.3.9')
    expect(updater!.download).not.toHaveBeenCalled()
  })

  it('discards a download that does not match its checksum, and installs nothing', async () => {
    const mismatch = new Error('sha512 checksum mismatch, expected abc, got def')
    const { updates, updater } = service({
      updater: fakeUpdater({ download: vi.fn().mockRejectedValue(mismatch) }),
    })
    await updates.check()
    const status = (await updates.download()).status

    expect(status).toMatchObject({ phase: 'failed', stage: 'download' })
    expect(status.phase === 'failed' && status.message).toMatch(
      /did not match.*Nothing was installed/,
    )
    expect(updater!.setInstallOnQuit).not.toHaveBeenCalled()
    expect(updater!.quitAndInstall).not.toHaveBeenCalled()
  })

  it('lets an interrupted download be tried again', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_RESET'))
      .mockResolvedValueOnce(undefined)
    const { updates } = service({ updater: fakeUpdater({ download }) })
    await updates.check()

    expect((await updates.download()).status).toMatchObject({ phase: 'failed', stage: 'download' })
    expect((await updates.download()).status).toMatchObject({ phase: 'ready' })
  })

  it('downloads nothing where the app cannot replace itself', async () => {
    const { updates } = service({ mode: 'notify', updater: null })
    await updates.check()
    expect((await updates.download()).status.phase).toBe('available')
  })

  it('keeps a finished download when a later check runs', async () => {
    const { updates, fetchReleases } = service()
    await updates.check()
    await updates.download()
    expect((await updates.check()).status.phase).toBe('ready')
    expect(fetchReleases).toHaveBeenCalledTimes(1)
  })
})

describe('installing', () => {
  async function ready(options: Parameters<typeof service>[0] = {}) {
    const made = service(options)
    await made.updates.check()
    await made.updates.download()
    return made
  }

  it('finishes pending saves before it looks at files or starts the installer', async () => {
    const order: string[] = []
    const { updates, updater } = await ready({
      settle: async () => void order.push('saves settled'),
      held: () => (order.push('files checked'), []),
      updater: fakeUpdater({ quitAndInstall: vi.fn(() => void order.push('installer started')) }),
    })
    await updates.install()
    expect(order).toEqual(['saves settled', 'files checked', 'installer started'])
    expect(updater!.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('waits, without stopping anything, while the MCP server holds installed files', async () => {
    let held = ['node.exe']
    const { updates, updater } = await ready({ held: () => held })

    const view = await updates.install()
    expect(view.status).toMatchObject({ phase: 'in-use', heldFiles: ['node.exe'] })
    expect(updater!.quitAndInstall).not.toHaveBeenCalled()

    held = []
    await updates.install()
    expect(updater!.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('installs on quit only when nothing it would replace is in use', async () => {
    let held = ['node.exe']
    const { updates, updater } = await ready({ held: () => held })

    updates.beforeQuit()
    expect(updater!.setInstallOnQuit).toHaveBeenLastCalledWith(false)
    held = []
    updates.beforeQuit()
    expect(updater!.setInstallOnQuit).toHaveBeenLastCalledWith(true)
  })

  it('reports an installer that could not start, and changes nothing', async () => {
    const { updates } = await ready({
      updater: fakeUpdater({
        quitAndInstall: vi.fn(() => {
          throw new Error('spawn EACCES')
        }),
      }),
    })
    expect((await updates.install()).status).toMatchObject({ phase: 'failed', stage: 'install' })
  })

  it('does nothing on install before anything is downloaded', async () => {
    const { updates, updater, settleSaves } = service()
    await updates.check()
    await updates.install()
    expect(settleSaves).not.toHaveBeenCalled()
    expect(updater!.quitAndInstall).not.toHaveBeenCalled()
  })
})
