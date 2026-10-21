import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureRelease } from './test-releases'

/**
 * Builds the real site once per download state, each from its own release data,
 * and checks the /download/ page a visitor would receive. Each state's data is
 * the data that triggers it (landing-page proposal §5).
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const STATES = {
  /** The checked-in file, with no releases: no fixture at all. */
  checkedIn: null,
  stable: [fixtureRelease('0.3.0')],
  missingTarget: [
    fixtureRelease('0.3.0', { targets: ['windows-x64', 'macos-arm64', 'linux-x64'] }),
  ],
  /** The risky case: an Intel Mac build and no Apple silicon one. */
  intelOnly: [fixtureRelease('0.3.0', { targets: ['windows-x64', 'macos-x64', 'linux-x64'] })],
  previewOnly: [fixtureRelease('0.2.0', { channel: 'preview' })],
  stableAndPreview: [fixtureRelease('0.3.0'), fixtureRelease('0.4.0', { channel: 'preview' })],
  withdrawn: [
    fixtureRelease('0.3.0'),
    fixtureRelease('0.3.1', { withdrawnReason: 'It could not open existing projects.' }),
  ],
  onlyWithdrawn: [
    fixtureRelease('0.3.1', { withdrawnReason: 'It could not open existing projects.' }),
  ],
} as const

type State = keyof typeof STATES

let workDir: string
const pages = {} as Record<State, string>

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'knightbook-download-'))
  for (const [state, releases] of Object.entries(STATES) as [State, unknown[] | null][]) {
    const outDir = join(workDir, state)
    const env = { ...process.env }
    if (releases) {
      const dataFile = join(workDir, `${state}.json`)
      await writeFile(dataFile, JSON.stringify({ releases }))
      env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS = dataFile
    } else {
      delete env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS
    }
    await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
    pages[state] = await readFile(join(outDir, 'download', 'index.html'), 'utf8')
  }
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

/** Every installer link on a page, by href. */
function installerLinks(html: string) {
  return [...html.matchAll(/href="([^"]+\.(?:exe|dmg|deb))"/g)].map((match) => match[1])
}

/** The card for one platform, from its opening tag to its close. */
function card(html: string, target: string) {
  return (
    html.match(new RegExp(`<li class="card"[^>]*data-target="${target}"[\\s\\S]*?</li>`))?.[0] ?? ''
  )
}

describe('the download page', () => {
  it('says downloads are not available yet when there is no release, and links no installer', () => {
    const html = pages.checkedIn
    expect(html).toMatch(/>Downloads are not available yet</)
    expect(installerLinks(html)).toEqual([])
    expect(html).not.toContain('class="card"')
  })

  it('explains it is a desktop app and lists every platform, for an unknown or mobile visitor', () => {
    for (const state of ['checkedIn', 'stable'] as const) {
      expect(pages[state], state).toContain(
        'Knightbook is a desktop app for Windows, macOS and Linux.',
      )
      expect(pages[state], state).toContain('On a phone or tablet?')
      expect(pages[state], state).toMatch(
        /Knightbook is free\. Its source code is public under the <a href="\/license\/"[^>]*>Functional Source License<\/a>\./,
      )
    }
    for (const target of ['windows-x64', 'macos-arm64', 'macos-x64', 'linux-x64']) {
      expect(card(pages.stable, target), target).not.toBe('')
    }
  })

  it('offers each platform its own file, with checksum, how to check it and the release page', () => {
    const html = pages.stable
    expect(installerLinks(html).sort()).toEqual(
      [
        'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-linux-x64.deb',
        'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-macos-arm64.dmg',
        'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-macos-x64.dmg',
        'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-windows-x64.exe',
      ].sort(),
    )
    // An Intel build is never offered as Apple silicon, nor the other way round.
    expect(installerLinks(card(html, 'macos-arm64'))).toEqual([
      'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-macos-arm64.dmg',
    ])
    expect(card(html, 'macos-arm64')).toContain('Apple silicon')
    expect(installerLinks(card(html, 'macos-x64'))).toEqual([
      'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-macos-x64.dmg',
    ])
    expect(card(html, 'macos-x64')).toContain('Intel')

    const windows = card(html, 'windows-x64')
    expect(windows).toMatch(/<code class="checksum[^"]*"[^>]*>[0-9a-f]{64}<\/code>/)
    expect(windows).toContain('How to check this file')
    expect(windows).toContain('Get-FileHash .\\Knightbook-0.3.0-windows-x64.exe -Algorithm SHA256')
    expect(card(html, 'linux-x64')).toContain('sha256sum Knightbook-0.3.0-linux-x64.deb')
    expect(card(html, 'macos-arm64')).toContain('shasum -a 256 Knightbook-0.3.0-macos-arm64.dmg')
    expect(windows).toContain('Not code-signed')
    expect(html).toMatch(
      /href="https:\/\/downloads\.example\.test\/releases\/0\.3\.0\/"[^>]*>Release notes/,
    )
    expect(html).not.toContain('<span class="preview-label')
  })

  it("gives every card its own file's checksum, how to check it, and every offer its release page", () => {
    for (const [state, release] of [
      ['stable', STATES.stable[0]],
      ['stableAndPreview', STATES.stableAndPreview[0]],
      ['stableAndPreview', STATES.stableAndPreview[1]],
    ] as const) {
      const html = pages[state]
      const offer =
        html.match(
          new RegExp(
            `<section class="offer"[^>]*data-version="${release.version}"[\\s\\S]*?</section>`,
          ),
        )?.[0] ?? ''
      expect(offer, `${state} ${release.version}`).toContain(`href="${release.notesUrl}"`)
      for (const asset of release.assets) {
        const target = `${asset.os}-${asset.arch}`
        const one = card(offer, target)
        expect(one, target).toMatch(
          new RegExp(`<code class="checksum[^"]*"[^>]*>${asset.sha256}</code>`),
        )
        expect(one, target).toContain('How to check this file')
        expect(one, target).toContain(asset.filename)
        expect(installerLinks(one), target).toEqual([asset.url])
      }
    }
  })

  it('never puts an Intel Mac build in the Apple silicon slot', () => {
    const html = pages.intelOnly
    const appleSilicon = card(html, 'macos-arm64')
    expect(installerLinks(appleSilicon)).toEqual([])
    expect(appleSilicon).toContain('has no build for macOS, Apple silicon')
    expect(appleSilicon).not.toContain('x64.dmg')
    expect(installerLinks(card(html, 'macos-x64'))).toEqual([
      'https://github.com/ninicdennis/knightbook/releases/download/v0.3.0/Knightbook-0.3.0-macos-x64.dmg',
    ])
  })

  it('says a platform has no build, linking nothing and substituting nothing', () => {
    const html = pages.missingTarget
    const intel = card(html, 'macos-x64')
    expect(intel).toContain('Knightbook 0.3.0 has no build for macOS, Intel.')
    expect(installerLinks(intel)).toEqual([])
    expect(installerLinks(html)).toHaveLength(3)
    expect(installerLinks(html).some((href) => href.includes('macos-x64'))).toBe(false)
  })

  it('labels a preview-only release and lists its known issues', () => {
    const html = pages.previewOnly
    expect(html).toMatch(/Knightbook 0\.2\.0\s*<span class="preview-label[^"]*"[^>]*>Preview</)
    expect(html).toContain('This is a preview build.')
    expect(html).toMatch(/<li[^>]*>The macOS app is not yet notarized\.<\/li>/)
    expect(installerLinks(html)).toHaveLength(4)
  })

  it('defaults to stable and keeps a newer preview behind a deliberate choice', () => {
    const html = pages.stableAndPreview
    const optIn = html.match(/<details class="opt-in[\s\S]*?<\/details>\s*<\/div>/)?.[0] ?? ''
    expect(optIn).toMatch(/^<details class="opt-in[^"]*"(?![^>]*\sopen)[^>]*>/)
    expect(optIn).toContain('Try the preview: Knightbook 0.4.0')
    expect(installerLinks(optIn).every((href) => href.includes('/v0.4.0/'))).toBe(true)
    expect(installerLinks(optIn)).toHaveLength(4)

    const outside = html.replace(optIn, '')
    expect(installerLinks(outside).every((href) => href.includes('/v0.3.0/'))).toBe(true)
    expect(installerLinks(outside)).toHaveLength(4)
  })

  it('never links a withdrawn release, and says why it was withdrawn', () => {
    const html = pages.withdrawn
    expect(installerLinks(html).some((href) => href.includes('0.3.1'))).toBe(false)
    expect(installerLinks(html)).toHaveLength(4)
    expect(html).toMatch(/Knightbook 0\.3\.1<\/strong>: It could not open existing projects\./)
  })

  it('offers nothing when the only release is withdrawn', () => {
    const html = pages.onlyWithdrawn
    expect(html).toMatch(/>Downloads are not available yet</)
    expect(installerLinks(html)).toEqual([])
    expect(html).toContain('Withdrawn releases')
  })

  it('fails the whole build, naming the problem, when the release data is malformed', async () => {
    const release = fixtureRelease('0.3.0')
    release.assets[0]!.sha256 = 'not-a-checksum'
    const dataFile = join(workDir, 'malformed.json')
    await writeFile(dataFile, JSON.stringify({ releases: [release] }))

    const build = run(
      process.execPath,
      [ASTRO_BIN, 'build', '--outDir', join(workDir, 'malformed')],
      {
        cwd: SITE_ROOT,
        env: { ...process.env, KNIGHTBOOK_RELEASE_DATA_FOR_TESTS: dataFile },
      },
    )
    await expect(build).rejects.toMatchObject({
      stderr: expect.stringMatching(/releases\[0\]\.assets\[0\]\.sha256: must be 64 lowercase/),
    })
  }, 120_000)

  it("marks the header's Download action as the current page, and nothing else", () => {
    const header = pages.checkedIn.match(/<header class="site-header[\s\S]*?<\/header>/)?.[0] ?? ''
    expect(header).toMatch(
      /<a class="kb-button download[^"]*" href="\/download\/" aria-current="page"[^>]*>Download<\/a>/,
    )
    expect(header.match(/aria-current/g)).toHaveLength(1)
  })

  it('works without JavaScript in every state', () => {
    for (const [state, html] of Object.entries(pages)) expect(html, state).not.toMatch(/<script/i)
  })
})
