import type {
  UpdateMode,
  UpdatePhase,
  UpdateRelease,
  UpdateView,
} from '../../shared/updates-contract.js'
import { pickUpdate, releaseDownloadBase, type OfferedRelease } from './release-feed.js'

/**
 * The update flow without Electron in it, so every state can be driven by a test
 * (D-056). The host wires it to GitHub, electron-updater and the IPC channel in
 * updates-ipc.ts.
 *
 * Nothing downloads until the user asks (`download`), and nothing installs
 * until they restart or quit. A failure at any stage is reported as that
 * failure, never as "up to date", and leaves the rest of the app alone.
 */

/** The parts of electron-updater this uses, so a test can stand in for it. */
export interface InPlaceUpdater {
  /** Points the updater at one release's files; resolves to the version its metadata names. */
  prepare(downloadBase: string): Promise<string | null>
  /** Downloads the installer and checks its SHA-512 against the metadata. */
  download(onProgress: (percent: number) => void): Promise<void>
  /** Quits and runs the downloaded installer, which reopens the app. */
  quitAndInstall(): void
  /** Whether a normal quit runs the downloaded installer silently. */
  setInstallOnQuit(enabled: boolean): void
}

export interface UpdateServiceOptions {
  currentVersion: string
  mode: UpdateMode
  fetchReleases(): Promise<unknown>
  /** Present only where the app can replace itself (Windows). */
  updater: InPlaceUpdater | null
  /** Installed files the installer would replace that another process holds open. */
  heldFiles(): string[]
  /** Resolves once app-state writes in flight have finished. */
  settleSaves(): Promise<void>
  now?: () => Date
}

const CHECKSUM_MISMATCH = /sha512 checksum mismatch|checksum/i

export class UpdateService {
  private status: UpdatePhase = { phase: 'idle' }
  private offered: OfferedRelease | null = null
  private readonly listeners = new Set<(view: UpdateView) => void>()

  constructor(private readonly options: UpdateServiceOptions) {}

  view(): UpdateView {
    return {
      currentVersion: this.options.currentVersion,
      mode: this.options.mode,
      status: this.status,
    }
  }

  onChange(listener: (view: UpdateView) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async check(): Promise<UpdateView> {
    if (this.options.mode === 'off') return this.view()
    // A download in progress or waiting to install is not thrown away by a check.
    if (['checking', 'downloading', 'ready', 'in-use'].includes(this.status.phase)) {
      return this.view()
    }
    this.set({ phase: 'checking' })
    try {
      const releases = await this.options.fetchReleases()
      this.offered = pickUpdate(releases, this.options.currentVersion)
      const now = (this.options.now ?? (() => new Date()))()
      this.set(
        this.offered
          ? { phase: 'available', release: publicRelease(this.offered) }
          : { phase: 'up-to-date', checkedAt: now.toISOString() },
      )
    } catch (error) {
      this.set({
        phase: 'failed',
        stage: 'check',
        message: `Could not check for updates: ${messageOf(error)}`,
        release: null,
      })
    }
    return this.view()
  }

  async download(): Promise<UpdateView> {
    const offered = this.offered
    const { updater } = this.options
    const retrying = this.status.phase === 'failed' && this.status.stage === 'download'
    if (!offered || !updater || !offered.installable) return this.view()
    if (this.status.phase !== 'available' && !retrying) return this.view()

    const release = publicRelease(offered)
    this.set({ phase: 'downloading', release, percent: null })
    try {
      const named = await updater.prepare(releaseDownloadBase(offered.tag))
      if (named !== offered.version) {
        throw new Error(
          `the release's update file names version ${named ?? 'none'}, not ${offered.version}`,
        )
      }
      await updater.download((percent) => {
        if (this.status.phase === 'downloading') {
          this.set({ phase: 'downloading', release, percent: Math.round(percent) })
        }
      })
      updater.setInstallOnQuit(true)
      this.set({ phase: 'ready', release })
    } catch (error) {
      const message = CHECKSUM_MISMATCH.test(messageOf(error))
        ? 'The download did not match the checksum the release published, so it was discarded.'
        : `The download failed: ${messageOf(error)}.`
      this.set({
        phase: 'failed',
        stage: 'download',
        message: `${message} Nothing was installed.`,
        release,
      })
    }
    return this.view()
  }

  async install(): Promise<UpdateView> {
    const { updater } = this.options
    const status = this.status
    if (!updater || (status.phase !== 'ready' && status.phase !== 'in-use')) return this.view()
    const release = status.release

    await this.options.settleSaves()
    const held = this.options.heldFiles()
    if (held.length > 0) {
      this.set({ phase: 'in-use', release, heldFiles: held })
      return this.view()
    }
    this.set({ phase: 'ready', release })
    try {
      updater.quitAndInstall()
    } catch (error) {
      this.set({
        phase: 'failed',
        stage: 'install',
        message: `The installer could not be started: ${messageOf(error)}. Nothing was changed.`,
        release,
      })
    }
    return this.view()
  }

  /**
   * Called as the app quits. A downloaded update installs on quit only when
   * nothing it would replace is in use; otherwise it waits for a later quit.
   */
  beforeQuit(): void {
    const { updater } = this.options
    if (!updater) return
    if (this.status.phase !== 'ready' && this.status.phase !== 'in-use') return
    updater.setInstallOnQuit(this.options.heldFiles().length === 0)
  }

  private set(status: UpdatePhase): void {
    this.status = status
    const view = this.view()
    for (const listener of this.listeners) listener(view)
  }
}

function publicRelease({ version, notesUrl, installable }: OfferedRelease): UpdateRelease {
  return { version, notesUrl, installable }
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/[.\s]+$/, '')
}
