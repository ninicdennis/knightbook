import { z } from 'astro/zod'

/**
 * The download page's facts, from a checked-in file (`releases.json`) rather
 * than a live API call (spec §5, landing-page proposal §5). Updating the file is
 * part of publishing a release, after its assets exist at their public URLs.
 *
 * Every field is checked at build time. A file that does not match fails the
 * build with a message naming each problem, so a mistake never reaches a
 * visitor as a broken or mislabelled download.
 */

/** The four builds D-028 launches with. Nothing else is offered, AppImage included. */
export const LAUNCH_TARGETS = [
  {
    key: 'windows-x64',
    os: 'windows',
    arch: 'x64',
    format: 'nsis',
    name: 'Windows',
    cpu: '64-bit (x64)',
  },
  {
    key: 'macos-arm64',
    os: 'macos',
    arch: 'arm64',
    format: 'dmg',
    name: 'macOS',
    cpu: 'Apple silicon (M-series)',
  },
  { key: 'macos-x64', os: 'macos', arch: 'x64', format: 'dmg', name: 'macOS', cpu: 'Intel' },
  {
    key: 'linux-x64',
    os: 'linux',
    arch: 'x64',
    format: 'deb',
    name: 'Linux',
    cpu: '64-bit (x64), .deb',
  },
] as const

export type LaunchTarget = (typeof LAUNCH_TARGETS)[number]

const https = z.url({ protocol: /^https$/, error: 'must be an https:// URL' })

/**
 * Where every installer is downloaded from: the release's assets on the public
 * GitHub repository (D-043), which need no login. The tag is `v<version>`, as
 * the release workflow creates it.
 */
export const RELEASE_DOWNLOADS = 'https://github.com/ninicdennis/knightbook/releases/download'

export function releaseDownloadBase(version: string) {
  return `${RELEASE_DOWNLOADS}/v${version}/`
}

const assetSchema = z
  .object({
    os: z.enum(['windows', 'macos', 'linux']),
    arch: z.enum(['x64', 'arm64']),
    format: z.enum(['nsis', 'dmg', 'deb']),
    minimumOs: z.string().min(1),
    url: https,
    filename: z.string().min(1),
    size: z.int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hexadecimal characters'),
    signing: z.enum(['unsigned', 'signed', 'signed-and-notarized']),
  })
  .strict()

const releaseSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'must look like 1.2.3'),
    channel: z.enum(['stable', 'preview']),
    date: z.iso.date(),
    notesUrl: https,
    withdrawn: z.boolean(),
    withdrawnReason: z.string().min(1).optional(),
    knownIssues: z.array(z.string().min(1)),
    /** Changes that affect upgrading or going back, such as a project-data format change. */
    compatibilityChanges: z.array(z.string().min(1)).default([]),
    assets: z.array(assetSchema),
  })
  .strict()
  .superRefine((release, context) => {
    if (release.withdrawn && !release.withdrawnReason) {
      context.addIssue({
        code: 'custom',
        path: ['withdrawnReason'],
        message: 'a withdrawn release must say why',
      })
    }
    if (release.channel === 'preview' && release.knownIssues.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['knownIssues'],
        message: 'a preview must list its known issues',
      })
    }
    const seen = new Set<string>()
    release.assets.forEach((asset, index) => {
      const at = ['assets', index]
      const target = targetOf(asset)
      if (!target) {
        context.addIssue({
          code: 'custom',
          path: at,
          message: `${asset.os} ${asset.arch} ${asset.format} is not a launch target (D-028)`,
        })
      } else if (seen.has(target.key)) {
        context.addIssue({ code: 'custom', path: at, message: `a second ${target.key} asset` })
      } else {
        seen.add(target.key)
      }
      if (!asset.url.startsWith(releaseDownloadBase(release.version))) {
        context.addIssue({
          code: 'custom',
          path: [...at, 'url'],
          message: `must be a GitHub Release asset under ${releaseDownloadBase(release.version)}`,
        })
      }
      if (!asset.url.endsWith(`/${asset.filename}`)) {
        context.addIssue({
          code: 'custom',
          path: [...at, 'url'],
          message: 'must end with the filename',
        })
      }
      if (!asset.filename.includes(release.version)) {
        context.addIssue({
          code: 'custom',
          path: [...at, 'filename'],
          message: `must name version ${release.version}, so the label and the file agree`,
        })
      }
    })
  })

const releaseDataSchema = z
  .object({ releases: z.array(releaseSchema) })
  .strict()
  .superRefine((data, context) => {
    const versions = data.releases.map((release) => release.version)
    versions.forEach((version, index) => {
      if (versions.indexOf(version) !== index) {
        context.addIssue({
          code: 'custom',
          path: ['releases', index, 'version'],
          message: `${version} appears twice`,
        })
      }
    })
  })

export type ReleaseData = z.infer<typeof releaseDataSchema>
export type Release = ReleaseData['releases'][number]
export type Asset = Release['assets'][number]

export function targetOf(asset: Pick<Asset, 'os' | 'arch' | 'format'>): LaunchTarget | undefined {
  return LAUNCH_TARGETS.find(
    (target) =>
      target.os === asset.os && target.arch === asset.arch && target.format === asset.format,
  )
}

/**
 * The release data, or an error listing every problem with its location, such
 * as `releases[0].assets[2].sha256: must be 64 lowercase hexadecimal characters`.
 */
export function parseReleaseData(raw: unknown, source = 'releases.json'): ReleaseData {
  const result = releaseDataSchema.safeParse(raw)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => {
    const where = issue.path
      .map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`))
      .join('')
      .replace(/^\./, '')
    return `  ${where || '(file)'}: ${issue.message}`
  })
  throw new Error(
    `The download page's release data in ${source} is not valid:\n${problems.join('\n')}`,
  )
}
