import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import type { ProjectImageView } from '../../shared/documents-contract.js'
import { CHECKOUT, detail, makeApi, renderApp } from '../test/test-fixtures.js'

/**
 * Showing images while reading a document (ticket 90e1db82). The window asks the
 * host for each in-project image and shows only what comes back as a data URL;
 * anything refused keeps a placeholder that says why, and a remote image is
 * never asked for at all.
 */

const LOGO = 'data:image/png;base64,iVBORw0KGgo='
const UNREVIEWED = { state: 'unreviewed', lastReviewedAt: null, changeSummary: null } as const

const README = [
  '# README',
  '',
  '<img src="docs/assets/logo.png" alt="The logo" width="192" />',
  '',
  '![A diagram](docs/assets/diagram.svg)',
  '',
  '![Gone](docs/assets/gone.png)',
  '',
  '![Remote](https://example.com/tracker.png)',
  '',
  '![Linked out](docs/escape/secret.png)',
  '',
  '![Huge](docs/assets/huge.png)',
  '',
  '![Unreadable](docs/assets/locked.png)',
].join('\n')

const IMAGES: Record<string, ProjectImageView> = {
  'docs/assets/logo.png': { kind: 'image', dataUrl: LOGO },
  'docs/assets/diagram.svg': {
    kind: 'unavailable',
    reason: 'unsupported_type',
    message: 'docs/assets/diagram.svg is not a PNG, JPEG, GIF or WebP image, so it was not shown.',
  },
  'docs/assets/gone.png': {
    kind: 'unavailable',
    reason: 'not_found',
    message: 'docs/assets/gone.png does not exist in this project.',
  },
  // A symlink out of the project: the path looks inside, the host says otherwise.
  'docs/escape/secret.png': {
    kind: 'unavailable',
    reason: 'outside_project',
    message: 'docs/escape/secret.png is not inside this project, so it was not shown.',
  },
  'docs/assets/huge.png': {
    kind: 'unavailable',
    reason: 'too_large',
    message: 'docs/assets/huge.png is 9.0 MB, over the 5.0 MB limit for images shown here.',
  },
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.listDocuments = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      documents: [
        { path: 'README.md', title: 'README', includedVia: 'README.md', review: UNREVIEWED },
      ],
      problems: [],
      folderTitles: [],
    },
  })
  api.readDocument = vi.fn().mockResolvedValue({
    ok: true,
    value: { path: 'README.md', content: README, revision: 'rev-1', review: UNREVIEWED },
  })
  api.readProjectImage = vi
    .fn()
    .mockImplementation(async (_root: string, path: string) =>
      path === 'docs/assets/locked.png'
        ? { ok: false, code: 'io_error', message: 'The file is locked by another program.' }
        : { ok: true, value: IMAGES[path] },
    )
  window.knightbook = api
})

async function openReadme() {
  renderApp()
  await user.click(await screen.findByText('Documents'))
  // The reader's own title and the document's first heading both say README.
  await screen.findAllByRole('heading', { name: 'README' })
}

describe('images in a document', () => {
  it('shows an in-project image from the data URL the host returned', async () => {
    await openReadme()

    const logo = await screen.findByRole('img', { name: 'The logo' })
    expect(logo.getAttribute('src')).toBe(LOGO)
    expect(logo.getAttribute('width')).toBe('192')
    expect(api.readProjectImage).toHaveBeenCalledWith(CHECKOUT, 'docs/assets/logo.png')
  })

  it('keeps a placeholder that says why for a refused or missing image', async () => {
    await openReadme()

    expect(await screen.findByText(/A diagram — .*not a PNG, JPEG, GIF or WebP/)).toBeTruthy()
    expect(await screen.findByText(/Gone — .*does not exist in this project/)).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'A diagram' })).toBeNull()
  })

  it('says why for an image outside the project, too large, or unreadable', async () => {
    await openReadme()

    expect(await screen.findByText(/Linked out — .*not inside this project/)).toBeTruthy()
    expect(await screen.findByText(/Huge — .*over the 5\.0 MB limit/)).toBeTruthy()
    expect(
      await screen.findByText(/Unreadable — It could not be read: The file is locked/),
    ).toBeTruthy()
  })

  it('never asks for a remote image, and says it was not loaded', async () => {
    await openReadme()

    expect(screen.getByText(/Remote — remote images are not loaded/)).toBeTruthy()
    await waitFor(() => expect(api.readProjectImage).toHaveBeenCalledTimes(6))
    expect(api.readProjectImage).not.toHaveBeenCalledWith(
      CHECKOUT,
      expect.stringMatching(/example\.com/),
    )
  })

  it('does not record a review by being shown', async () => {
    await openReadme()
    await screen.findByRole('img', { name: 'The logo' })

    expect(api.reviewDocument).not.toHaveBeenCalled()
  })
})

describe('images in a ticket', () => {
  it('resolves from the ticket file and shows what the host returns', async () => {
    api.readProjectImage = vi
      .fn()
      .mockImplementation(async (_root: string, path: string) =>
        path === 'docs/shots/board.png'
          ? { ok: true, value: { kind: 'image', dataUrl: LOGO } }
          : { ok: true, value: { kind: 'unavailable', reason: 'not_found', message: 'missing' } },
      )
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ body: '# A ticket\n\n![The board](../../docs/shots/board.png)\n' }),
    })
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByRole('img', { name: 'The board' })).toBeTruthy()
    expect(api.readProjectImage).toHaveBeenCalledWith(CHECKOUT, 'docs/shots/board.png')
  })
})
