import {
  LAUNCH_TARGETS,
  targetOf,
  type Asset,
  type LaunchTarget,
  type Release,
  type ReleaseData,
} from './release-data'

/**
 * What the download page offers, decided from the release data alone so every
 * state in the landing-page proposal §5 is a plain function of the file:
 *
 * - no usable release: nothing is offered and the page says so;
 * - a stable release: it is the default;
 * - only previews: the newest is offered, labelled as a preview;
 * - stable and a newer preview: stable is the default, the preview is a
 *   deliberate opt-in;
 * - a withdrawn release is never recommended or linked, and is listed with why.
 */
export interface TargetChoice {
  target: LaunchTarget
  /** Null when this release has no build for the target: no substitute is offered. */
  asset: Asset | null
}

export interface ReleaseOffer {
  release: Release
  choices: TargetChoice[]
}

export interface DownloadView {
  recommended: ReleaseOffer | null
  optInPreview: ReleaseOffer | null
  withdrawn: Release[]
}

function compareVersions(a: string, b: string) {
  const [aParts, bParts] = [a, b].map((version) => version.split('.').map(Number))
  for (let index = 0; index < 3; index += 1) {
    const difference = (aParts?.[index] ?? 0) - (bParts?.[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function newestFirst(releases: Release[]) {
  return [...releases].sort((a, b) => compareVersions(b.version, a.version))
}

export function offerFor(release: Release): ReleaseOffer {
  return {
    release,
    choices: LAUNCH_TARGETS.map((target) => ({
      target,
      asset: release.assets.find((asset) => targetOf(asset)?.key === target.key) ?? null,
    })),
  }
}

export function downloadView(data: ReleaseData): DownloadView {
  const usable = newestFirst(data.releases.filter((release) => !release.withdrawn))
  const stable = usable.find((release) => release.channel === 'stable')
  const preview = usable.find((release) => release.channel === 'preview')

  const recommended = stable ?? preview ?? null
  const optInPreview =
    stable && preview && compareVersions(preview.version, stable.version) > 0 ? preview : null

  return {
    recommended: recommended ? offerFor(recommended) : null,
    optInPreview: optInPreview ? offerFor(optInPreview) : null,
    withdrawn: newestFirst(data.releases.filter((release) => release.withdrawn)),
  }
}

export interface HistoryEntry {
  release: Release
  /** For a withdrawn release, the version to use instead: the one /download/ recommends. */
  useInstead: string | null
}

/** Every release, newest first, for /releases/. Withdrawn ones point at the recommended release. */
export function releaseHistory(data: ReleaseData): HistoryEntry[] {
  const recommended = downloadView(data).recommended?.release.version ?? null
  return newestFirst(data.releases).map((release) => ({
    release,
    useInstead: release.withdrawn ? recommended : null,
  }))
}

/** A file size as people read it, for example "128.4 MB". */
export function formatSize(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** The command that prints a file's SHA-256 on the target's own system. */
export function checksumCommand(asset: Pick<Asset, 'os' | 'filename'>) {
  switch (asset.os) {
    case 'windows':
      return `Get-FileHash .\\${asset.filename} -Algorithm SHA256`
    case 'macos':
      return `shasum -a 256 ${asset.filename}`
    case 'linux':
      return `sha256sum ${asset.filename}`
  }
}

/** Where the command runs, named as the visitor will find it. */
export function checksumShell(asset: Pick<Asset, 'os'>) {
  return asset.os === 'windows' ? 'PowerShell' : 'Terminal'
}

export const SIGNING_LABEL: Record<Asset['signing'], string> = {
  unsigned: 'Not code-signed',
  signed: 'Code-signed',
  'signed-and-notarized': 'Code-signed and notarized by Apple',
}
