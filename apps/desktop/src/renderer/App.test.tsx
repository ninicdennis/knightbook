import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectspaceApi } from '../shared/contract.js'
import { makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * These cover the states the specification says must stay distinguishable: work
 * that cannot start and why, a completion with no attributable decision, and the
 * difference between "nothing eligible" and "nothing left". Drag-and-drop itself
 * is not exercised; the card menu performs the same moves and is the path a
 * keyboard user takes.
 */

let api: ProjectspaceApi
/** A fresh instance per test: the shared default keeps pointer state between tests. */
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.projectspace = api
})

describe('opening a project', () => {
  it('reopens the most recent project and shows its checkout path', async () => {
    renderApp()
    expect(await screen.findByText('Demo')).toBeTruthy()
    // Technical design section 4: two clones share an id, so the path must show.
    expect(screen.getByText('C:\\projects\\demo')).toBeTruthy()
  })

  it('reports a load failure and says the files were left alone', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: false,
      code: 'invalid_record',
      message: 'project.md contains unresolved merge conflict markers.',
    })
    renderApp()

    expect(await screen.findByText(/could not open this project/i)).toBeTruthy()
    expect(screen.getByText(/unresolved merge conflict markers/i)).toBeTruthy()
    expect(screen.getByText(/your files are exactly as they were/i)).toBeTruthy()
  })
})

describe('the board distinguishes states that must not look alike', () => {
  it('shows why a backlog ticket cannot start', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            title: 'Build the board',
            dependencyReady: false,
            dependsOn: ['22222222-2222-4222-8222-222222222222'],
            dependencyNotes: ['waiting on "Safe writes" (2222…), which is in_progress'],
          }),
        ],
      }),
    })
    renderApp()

    expect(await screen.findByText('Build the board')).toBeTruthy()
    expect(screen.getByText(/waiting on 1/i)).toBeTruthy()
  })

  it('flags a Done ticket that carries no recorded decision', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({ title: 'Edited elsewhere', status: 'done', completionUnattributed: true }),
        ],
      }),
    })
    renderApp()

    expect(await screen.findByText('Edited elsewhere')).toBeTruthy()
    expect(screen.getByText(/unattributed/i)).toBeTruthy()
  })

  it('distinguishes an AI-recorded completion from one the user made directly', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            title: 'Recorded by the agent',
            status: 'done',
            completion: {
              decisionSource: 'reported_user_instruction',
              recordedBy: 'agent',
              recordedAt: '2026-09-19T10:00:00Z',
              instruction: 'User confirmed it in chat.',
            },
          }),
        ],
      }),
    })
    renderApp()

    expect(await screen.findByText('Recorded by the agent')).toBeTruthy()
    const badge = screen.getByText(/recorded by ai/i)

    // The badge stays short so it survives a narrow column; the tooltip carries
    // the part that must not be lost, which is that the AI did not decide it.
    await user.hover(badge)
    expect(await screen.findByText(/it did not decide this itself/i)).toBeTruthy()

    // Leaving the pointer on the badge would keep the tooltip open for the rest
    // of this test; the per-test user instance handles isolation.
    await user.unhover(badge)
  })

  it('says why no backlog work is eligible rather than showing an empty column', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [ticket({ status: 'in_progress' })],
        nextExplanation: 'No backlog ticket is eligible to start:\n- "Board" waiting on "Schema"',
      }),
    })
    renderApp()

    expect(await screen.findByText(/no backlog ticket is eligible to start/i)).toBeTruthy()
  })
})

describe('moving work', () => {
  it('moves a ticket through the menu without touching Done', async () => {
    const moved = project({ tickets: [ticket({ status: 'in_progress' })] })
    api.setTicketStatus = vi.fn().mockResolvedValue({ ok: true, value: moved })
    renderApp()

    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))

    // Done is absent from the move menu: it is not an ordinary status change.
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByText('Done')).toBeNull()

    await user.click(within(menu).getByText('In progress'))
    await waitFor(() =>
      expect(api.setTicketStatus).toHaveBeenCalledWith(
        'C:\\projects\\demo',
        ticket().id,
        'in_progress',
        'rev-1',
      ),
    )
  })

  it('asks before recording a completion, and says it is the user decision', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'verification' })] }),
    })
    api.completeTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'done' })] }),
    })
    renderApp()

    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(await screen.findByText(/accept as done/i))

    expect(await screen.findByText(/records that you accepted the work/i)).toBeTruthy()
    expect(api.completeTicket).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^accept as done$/i }))
    await waitFor(() =>
      expect(api.completeTicket).toHaveBeenCalledWith('C:\\projects\\demo', ticket().id, 'rev-1'),
    )
  })

  it('reloads and explains when a ticket changed underneath', async () => {
    api.setTicketStatus = vi.fn().mockResolvedValue({
      ok: false,
      code: 'revision_conflict',
      message: 'The record changed since it was read.',
      currentRevision: 'rev-2',
    })
    renderApp()

    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('In progress'))

    expect(await screen.findByText(/changed somewhere else/i)).toBeTruthy()
    expect(screen.getByText(/your move was not applied/i)).toBeTruthy()
    // The view is refetched rather than left showing what the caller assumed.
    await waitFor(() => expect(api.readProject).toHaveBeenCalledTimes(2))
  })
})

describe('human review (D-003, D-004)', () => {
  it('shows unreviewed content as unreviewed rather than leaving it blank', async () => {
    renderApp()
    await screen.findByText('A ticket')
    expect(screen.getByText(/^unreviewed$/i)).toBeTruthy()
  })

  it('records the review as the user\u2019s own action', async () => {
    api.recordTicketReview = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            review: {
              state: 'reviewed',
              lastReviewedAt: '2026-09-19T10:00:00Z',
              changeSummary: null,
            },
          }),
        ],
      }),
    })
    renderApp()

    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(await screen.findByText(/mark content reviewed/i))

    await waitFor(() =>
      expect(api.recordTicketReview).toHaveBeenCalledWith(project().checkoutPath, ticket().id, ''),
    )
    await waitFor(() => expect(screen.queryByText(/^unreviewed$/i)).toBeNull())
  })

  it('distinguishes a stale review from one that never happened', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            review: {
              state: 'changed_since_review',
              lastReviewedAt: '2026-09-01T10:00:00Z',
              changeSummary: 'The content changed in a way that is not only formatting or status.',
            },
          }),
        ],
      }),
    })
    renderApp()

    await screen.findByText('A ticket')
    expect(screen.getByText(/changed since review/i)).toBeTruthy()
    expect(screen.queryByText(/^unreviewed$/i)).toBeNull()
  })

  it('does not block an unreviewed ticket from moving (D-004)', async () => {
    api.setTicketStatus = vi.fn().mockResolvedValue({ ok: true, value: project() })
    renderApp()

    await screen.findByText('A ticket')
    expect(screen.getByText(/^unreviewed$/i)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('In progress'))

    await waitFor(() => expect(api.setTicketStatus).toHaveBeenCalled())
  })

  it('offers no review action once content is reviewed', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            review: {
              state: 'reviewed',
              lastReviewedAt: '2026-09-19T10:00:00Z',
              changeSummary: null,
            },
          }),
        ],
      }),
    })
    renderApp()

    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByText(/mark content reviewed/i)).toBeNull()
  })
})
