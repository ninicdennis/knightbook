import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { CHECKOUT, makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * Decision D-017 in the window. What the board has to show is two different
 * facts — this failed verification, and this rests on something that did — and
 * that neither of them moved any card.
 */

const PREREQUISITE_ID = '22222222-2222-4222-8222-222222222222'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function boardWithFailure() {
  return project({
    tickets: [
      ticket({
        id: PREREQUISITE_ID,
        title: 'Importer',
        status: 'verification',
        verificationIssue: {
          reason: 'Dates import an hour off.',
          decisionSource: 'direct_user_action',
          recordedBy: 'user',
          recordedAt: '2026-09-03T09:00:00Z',
        },
      }),
      ticket({
        title: 'Report',
        status: 'in_progress',
        dependsOn: [PREREQUISITE_ID],
        affectedBy: [
          {
            ticketId: PREREQUISITE_ID,
            title: 'Importer',
            issue: 'Dates import an hour off.',
            direct: true,
          },
        ],
      }),
    ],
  })
}

describe('a prerequisite that failed verification', () => {
  it('shows the failure and the affected work as separate states', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: boardWithFailure() })

    renderApp()

    expect(await screen.findByText('Failed verification')).toBeTruthy()
    expect(screen.getByText('Affected by a failure')).toBeTruthy()
  })

  it('tells the affected ticket what failed and that nothing was changed for it', async () => {
    const board = boardWithFailure()
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: board })
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        ...board.tickets[1]!,
        body: '# Report\n',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-02T10:00:00Z',
        relatedDocuments: [],
        dependencies: [],
        previousCompletions: [],
      },
    })

    renderApp()
    await user.click(await screen.findByText('Report'))

    expect(await screen.findByText('Affected by a failed verification')).toBeTruthy()
    expect(screen.getByText(/Dates import an hour off\./)).toBeTruthy()
    expect(screen.getByText(/Nothing here was changed for you/)).toBeTruthy()
  })

  it('records the reason the user typed, and nothing without one', async () => {
    const board = project({
      tickets: [ticket({ id: PREREQUISITE_ID, title: 'Importer', status: 'verification' })],
    })
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: board })
    api.recordVerificationIssue = vi.fn().mockResolvedValue({ ok: true, value: board })

    renderApp()

    await user.click(await screen.findByLabelText('Actions for Importer'))
    await user.click(await screen.findByText('Did not pass verification…'))

    // An empty reason would tell the dependent work nothing, so it cannot be sent.
    expect(screen.getByRole('button', { name: 'Record the issue' }).hasAttribute('disabled')).toBe(
      true,
    )

    await user.type(screen.getByLabelText('Reason'), 'Dates import an hour off.')
    await user.click(screen.getByRole('button', { name: 'Record the issue' }))

    expect(api.recordVerificationIssue).toHaveBeenCalledWith(
      CHECKOUT,
      PREREQUISITE_ID,
      'rev-1',
      'Dates import an hour off.',
    )
  })

  it('offers resolving the issue only once there is one', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: boardWithFailure() })
    api.resolveVerificationIssue = vi
      .fn()
      .mockResolvedValue({ ok: true, value: boardWithFailure() })

    renderApp()

    await user.click(await screen.findByLabelText('Actions for Report'))
    expect(screen.queryByText('Resolve the verification issue')).toBeNull()
    await user.keyboard('{Escape}')

    await user.click(await screen.findByLabelText('Actions for Importer'))
    await user.click(await screen.findByText('Resolve the verification issue'))

    expect(api.resolveVerificationIssue).toHaveBeenCalledWith(CHECKOUT, PREREQUISITE_ID, 'rev-1')
  })
})
