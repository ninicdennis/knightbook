import { createHash } from 'node:crypto'

/**
 * Release data for the download tests, built in code so each state's data is
 * visible beside the test that uses it. The URLs are fictional fixtures.
 */
type Target = 'windows-x64' | 'macos-arm64' | 'macos-x64' | 'linux-x64'

const ALL_TARGETS: Target[] = ['windows-x64', 'macos-arm64', 'macos-x64', 'linux-x64']

const SHAPE = {
  'windows-x64': {
    os: 'windows',
    arch: 'x64',
    format: 'nsis',
    ext: 'exe',
    minimumOs: 'Windows 10 or later',
  },
  'macos-arm64': {
    os: 'macos',
    arch: 'arm64',
    format: 'dmg',
    ext: 'dmg',
    minimumOs: 'macOS 13 Ventura or later',
  },
  'macos-x64': {
    os: 'macos',
    arch: 'x64',
    format: 'dmg',
    ext: 'dmg',
    minimumOs: 'macOS 13 Ventura or later',
  },
  'linux-x64': {
    os: 'linux',
    arch: 'x64',
    format: 'deb',
    ext: 'deb',
    minimumOs: 'Ubuntu 22.04 or a similar current Debian-based release',
  },
} as const

export function fixtureAsset(version: string, target: Target) {
  const { os, arch, format, ext, minimumOs } = SHAPE[target]
  const filename = `Knightbook-${version}-${os}-${arch}.${ext}`
  return {
    os,
    arch,
    format,
    // Widened, so a test can blank it to check the validation.
    minimumOs: minimumOs as string,
    url: `https://downloads.example.test/releases/${version}/${filename}`,
    filename,
    size: 134_335_009,
    // Different for every file, so a test can tell one card's checksum from another's.
    sha256: createHash('sha256').update(filename).digest('hex'),
    signing: 'unsigned',
  }
}

export function fixtureRelease(
  version: string,
  options: {
    channel?: 'stable' | 'preview'
    targets?: Target[]
    withdrawnReason?: string
    knownIssues?: string[]
    compatibilityChanges?: string[]
    date?: string
  } = {},
) {
  const channel = options.channel ?? 'stable'
  return {
    version,
    channel,
    date: options.date ?? '2026-10-02',
    notesUrl: `https://downloads.example.test/releases/${version}/`,
    withdrawn: options.withdrawnReason !== undefined,
    ...(options.withdrawnReason ? { withdrawnReason: options.withdrawnReason } : {}),
    knownIssues:
      options.knownIssues ?? (channel === 'preview' ? ['The macOS app is not yet notarized.'] : []),
    ...(options.compatibilityChanges ? { compatibilityChanges: options.compatibilityChanges } : {}),
    assets: (options.targets ?? ALL_TARGETS).map((target) => fixtureAsset(version, target)),
  }
}
