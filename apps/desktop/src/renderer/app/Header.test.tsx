import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApi, project, renderApp } from '../test/test-fixtures.js'

/**
 * The header truncates a long name and path on screen so they cannot push the
 * controls out of the window. Truncation is visual only: the full text has to
 * stay in the document, where assistive technology reads it.
 */

const LONG_PATH = String.raw`C:\Users\someone\Projects\clients\acme\worktrees\feature-branch\second-clone`

beforeEach(() => {
  const api = makeApi()
  api.readProject = async () => ({
    ok: true,
    value: project({ name: 'A long project name', checkoutPath: LONG_PATH }),
  })
  window.knightbook = api
})

describe('the project header', () => {
  it('names the project as the page heading', async () => {
    renderApp()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'A long project name' }),
    ).toBeTruthy()
  })

  it('keeps the whole checkout path in the document', async () => {
    renderApp()
    expect(await screen.findByText(LONG_PATH)).toBeTruthy()
  })

  it('keeps every header control reachable', async () => {
    renderApp()
    await screen.findByText(LONG_PATH)
    for (const name of [
      /open project menu/i,
      /search tickets/i,
      /refresh from disk/i,
      /open settings/i,
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    for (const name of ['Board', 'Documents', 'Archive']) {
      expect(screen.getByRole('radio', { name })).toBeTruthy()
    }
  })
})
