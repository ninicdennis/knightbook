import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { call, connect } from './client.js'
import { packagedApp, requireWhenAsked } from './packaged.js'
import { removeWorkspace } from './stage.js'

/**
 * The real Electron window of the packaged app. Every other suite here stops at
 * the MCP server, which runs with the GUI closed on purpose; nothing has so far
 * launched the window that a user actually opens, so a renderer regression that
 * survives the unit tests would ship unnoticed.
 *
 * The board is driven through the card menu rather than by dragging. Drag-and-drop
 * is pointer-only, the menu performs the same moves, and it is the path a keyboard
 * user takes — so it is both the more valuable path and the testable one.
 *
 * Playwright's Electron support is experimental (technical design section 2). It
 * is used here only to launch the packaged binary and click visible controls; the
 * assertion that matters is made against the ticket file on disk, not the DOM.
 *
 * `playwright-core` rather than `playwright`: driving Electron needs no Chromium,
 * Firefox or WebKit download, and the full package fetches all three on install.
 */

const app = await packagedApp()
requireWhenAsked(app, 'a packaged app with a launchable binary')
const describeWindow = app ? describe : describe.skip

/** The board reopens the most recent project, so seeding this file chooses it. */
async function seedUserData(userDataDir: string, projectRoot: string): Promise<void> {
  await mkdir(userDataDir, { recursive: true })
  await writeFile(
    join(userDataDir, 'app-state.json'),
    JSON.stringify({
      recentProjects: [{ path: projectRoot, name: 'Window smoke test' }],
      settings: { colorScheme: 'light' },
    }),
    'utf8',
  )
}

/** The status recorded in the ticket's own file, which is the durable record. */
async function statusOnDisk(projectRoot: string, id: string): Promise<string> {
  const file = await readFile(join(projectRoot, '.projectspace', 'tickets', `${id}.md`), 'utf8')
  return /^status:\s*(\S+)$/m.exec(file)?.[1] ?? 'unreadable'
}

let workspace: string
let projectRoot: string
let userDataDir: string
let ticketId: string
let electronApp: ElectronApplication
let page: Page

beforeAll(async () => {
  if (!app) return

  workspace = await mkdtemp(join(tmpdir(), 'knightbook-window-'))
  projectRoot = join(workspace, 'project')
  userDataDir = join(workspace, 'user-data')

  /*
   * The fixture is built through the app's own shipped MCP server rather than by
   * writing frontmatter here, so the window opens records produced by the same
   * code that validates them.
   */
  const connection = await connect(app, projectRoot, workspace)
  try {
    await call(connection, 'project_initialize', { name: 'Window smoke test' })
    const created = await call(connection, 'ticket_create', {
      title: 'Move me with the card menu',
    })
    ticketId = created['id'] as string
  } finally {
    await connection.close()
  }

  await seedUserData(userDataDir, projectRoot)

  electronApp = await electron.launch({
    executablePath: app.executablePath,
    // Keeps the run off the developer's real recent-projects list and settings.
    args: [`--user-data-dir=${userDataDir}`],
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
}, 120_000)

afterAll(async () => {
  await electronApp?.close().catch(() => {})
  if (workspace) await removeWorkspace(workspace)
})

describeWindow('the packaged window', () => {
  it('opens the remembered project and shows its board', async () => {
    await expect
      .poll(
        () =>
          page
            .getByText('Window smoke test')
            .first()
            .isVisible()
            .catch(() => false),
        {
          timeout: 30_000,
        },
      )
      .toBe(true)

    expect(await page.getByText('Move me with the card menu').first().isVisible()).toBe(true)
  })

  it('captures a screenshot of the running window', async () => {
    // The ticket recorded that no screenshot of the packaged window could be
    // taken in the environment used so far. Failing to produce one is a real
    // result, so it is asserted rather than attempted and ignored.
    const file = join(workspace, 'packaged-window.png')
    await page.screenshot({ path: file })
    expect((await stat(file)).size).toBeGreaterThan(1000)
  })

  it('moves a card through its menu and records it in the ticket file', async () => {
    expect(await statusOnDisk(projectRoot, ticketId)).toBe('backlog')

    /*
     * `exact` matters on both of these. Playwright matches an accessible name as
     * a substring by default, and dnd-kit wraps each card in a role="button"
     * draggable whose name is built from the card's contents — so it contains the
     * menu button's own label and matches too. Without `exact` this is a strict
     * mode violation, not a wrong click.
     */
    await page
      .getByRole('button', { name: 'Actions for Move me with the card menu', exact: true })
      .click()
    await page.getByRole('menuitem', { name: 'In progress', exact: true }).click()

    await expect
      .poll(() => statusOnDisk(projectRoot, ticketId), { timeout: 20_000 })
      .toBe('in_progress')
  })
})
