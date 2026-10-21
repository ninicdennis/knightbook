import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * The website's deployment workflow (D-044, ticket 23bed0a1), read as text: who
 * can publish, from where, and with what. A change that would let a pull request
 * or another branch publish, or that adds a stored secret, fails here.
 */
const WORKFLOW = new URL('../../../../.github/workflows/website.yml', import.meta.url)

async function workflow() {
  return readFile(WORKFLOW, 'utf8')
}

/** The text of one job, from its key to the next job or the end. */
function job(text: string, name: string) {
  const start = text.indexOf(`\n  ${name}:\n`)
  expect(start, `no job ${name}`).toBeGreaterThan(-1)
  const rest = text.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[a-z-]+:\n/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

describe('the website deployment workflow', () => {
  it('builds for production only on main, not for a pull request, and only once switched on', async () => {
    const text = await workflow()
    const choose = text.match(/echo "production=\$\{\{ (.+) \}\}"/)?.[1] ?? ''
    expect(choose).toContain("github.ref == 'refs/heads/main'")
    expect(choose).toContain("github.event_name != 'pull_request'")
    expect(choose).toContain("vars.DEPLOY_WEBSITE == 'true'")
    expect(choose.split(' && ')).toHaveLength(3)
  })

  it('deploys only the production build, after the build job passed', async () => {
    const deploy = job(await workflow(), 'deploy')
    expect(deploy).toMatch(/needs: build\n/)
    expect(deploy).toMatch(/if: needs\.build\.outputs\.production == 'true'\n/)
    expect(deploy).toMatch(/uses: actions\/deploy-pages@[0-9a-f]{40} /)
  })

  it('makes the production build refuse drafts, and tests the site first on main', async () => {
    const build = job(await workflow(), 'build')
    expect(build).toMatch(
      /- name: Build for production\n\s+if: steps\.stage\.outputs\.production == 'true'\n\s+run: pnpm --filter @knightbook\/website build\n\s+env:\n\s+KNIGHTBOOK_SITE_STAGE: production/,
    )
    const testStep = build.indexOf('pnpm --filter @knightbook/website test')
    expect(testStep).toBeGreaterThan(-1)
    expect(testStep).toBeLessThan(build.indexOf('Build for production'))
  })

  it('keeps a pull request preview as an artifact, never as a Pages deployment', async () => {
    const build = job(await workflow(), 'build')
    expect(build).toMatch(
      /- name: Keep the preview\n\s+if: steps\.stage\.outputs\.production != 'true'\n\s+uses: actions\/upload-artifact@/,
    )
    expect(build).toMatch(
      /- name: Keep the production build for Pages\n\s+if: steps\.stage\.outputs\.production == 'true'\n\s+uses: actions\/upload-pages-artifact@/,
    )
  })

  it('uses no stored secret, reads by default, and grants Pages write access only to deploy', async () => {
    const text = await workflow()
    expect(text).not.toMatch(/secrets\./)
    expect(text).not.toMatch(/pull_request_target/)
    expect(text).toMatch(/\npermissions:\n {2}contents: read\n/)
    expect(job(text, 'build')).not.toMatch(/pages: write|id-token: write/)
    expect(job(text, 'deploy')).toMatch(/permissions:\n\s+pages: write\n\s+id-token: write\n/)
  })
})
