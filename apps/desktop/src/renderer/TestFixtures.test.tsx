import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { makeApi, renderApp, TICKET_ID } from './test-fixtures.js'

/**
 * The shared fixture itself. A mutation that resolved to undefined surfaced only
 * as an "Unhandled Errors" block after a run in which every test passed, so this
 * carries one through the app with no local overrides and fails if anything
 * rejects unhandled.
 */

let api: KnightbookApi
const unhandled: unknown[] = []
const record = (reason: unknown) => void unhandled.push(reason)

beforeEach(() => {
  unhandled.length = 0
  process.on('unhandledRejection', record)
  api = makeApi()
  window.knightbook = api
})

afterEach(() => {
  process.off('unhandledRejection', record)
})

describe('the default test API', () => {
  it('answers every board mutation with a usable result', async () => {
    const mutations = [
      api.setTicketStatus('root', 'id', 'in_progress', 'rev'),
      api.setTicketType('root', 'id', null, 'rev'),
      api.completeTicket('root', 'id', 'rev'),
      api.recordVerificationIssue('root', 'id', 'rev', 'why'),
      api.resolveVerificationIssue('root', 'id', 'rev'),
      api.recordTicketReview('root', 'id', ''),
      api.restoreTicket('root', 'id', 'rev'),
      api.reorderBacklog('root', ['id']),
    ]
    for (const result of await Promise.all(mutations)) {
      expect(result.ok).toBe(true)
    }
  })

  it('lets a move go all the way through the app without an unhandled error', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByText('A ticket')

    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('In progress'))

    await waitFor(() =>
      expect(api.setTicketStatus).toHaveBeenCalledWith(
        expect.anything(),
        TICKET_ID,
        'in_progress',
        expect.anything(),
      ),
    )
    // Let the app consume the result before looking for fallout.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(unhandled).toEqual([])
    expect(screen.getByText('A ticket')).toBeTruthy()
  })
})
