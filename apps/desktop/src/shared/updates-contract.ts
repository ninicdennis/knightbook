/**
 * In-app updates (D-056). The host checks GitHub Releases for a newer version and
 * tells the window what it found. Windows installs can download and install the
 * update in place, after the user asks; macOS and Linux are told a version is out
 * and pointed at the download page, because neither can be replaced in place yet
 * (the Mac build has no Developer ID signature, and Linux ships a deb).
 */

/**
 * What this installation can do with an update. `off` is a build that is not an
 * installed release (development, or never stamped with a version), which never
 * checks at all, so it never claims to be up to date.
 */
export type UpdateMode = 'install' | 'notify' | 'off'

/** A newer release, as the update check found it. */
export interface UpdateRelease {
  version: string
  /** The release's page on GitHub, for its notes. */
  notesUrl: string
  /** Whether this release carries what an in-place install needs (Windows only). */
  installable: boolean
}

export type UpdatePhase =
  /** Not checked since launch. */
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date'; checkedAt: string }
  | { phase: 'available'; release: UpdateRelease }
  /** Bytes are arriving; `percent` is null until the size is known. */
  | { phase: 'downloading'; release: UpdateRelease; percent: number | null }
  /** Downloaded and checked against its SHA-512; installs on restart or on quit. */
  | { phase: 'ready'; release: UpdateRelease }
  /**
   * Downloaded, but files the install would replace are open, normally because
   * an AI client is running the bundled MCP server. Nothing is stopped for it.
   */
  | { phase: 'in-use'; release: UpdateRelease; heldFiles: string[] }
  | {
      phase: 'failed'
      stage: 'check' | 'download' | 'install'
      message: string
      release: UpdateRelease | null
    }

export interface UpdateView {
  currentVersion: string
  mode: UpdateMode
  status: UpdatePhase
}

/** Where macOS and Linux users, and anyone whose install failed, get the installer. */
export const DOWNLOAD_PAGE_URL = 'https://knightbook.xyz/download/'

export interface UpdatesApi {
  /** What is known now, without checking. */
  updateView(): Promise<UpdateView>
  /** Checks GitHub Releases now and returns the outcome. */
  checkForUpdates(): Promise<UpdateView>
  /** Windows: downloads the release the last check found. Nothing downloads without this. */
  downloadUpdate(): Promise<UpdateView>
  /**
   * Windows: finishes pending saves, checks that no file it would replace is in
   * use, then quits and runs the installer, which reopens the app.
   */
  installUpdate(): Promise<UpdateView>
  /** Called with every later change; returns a function that stops it. */
  onUpdateView(listener: (view: UpdateView) => void): () => void
}
