import type { ProjectView, Result, TicketDetailView } from '../src/shared/contract.js'

/**
 * Builds the detail the real host would return, from the preview's board data, so
 * the actual modal can be reviewed in a browser. The body deliberately includes a
 * script and an unsafe link to show what the sanitizer does with them.
 */

const BODY = `# Ticket detail view

## Intended outcome
Clicking a card opens a modal showing everything written on the ticket.

## Acceptance criteria
- Click or Enter opens the modal. A drag does not.
- Shows dependencies with the status of each prerequisite.
- Related documents open in the Documents view.

See [the specification](docs/architecture.md) for the reasoning. This
[unsafe link](javascript:alert(1)) is refused, and the script below is stripped.

<script>document.title = 'pwned'</script>

## Notes
Found by the user while trying the app.

The rest of this body exists so the preview shows a ticket long enough to scroll.
Real tickets written through MCP run to this length, and the actions below have to
stay reachable without reading to the end of one.

- A criterion that is long enough to wrap onto a second line in the dialog, because
  acceptance criteria written by an agent usually are.
- Another one, so the list has weight.
- A third, mentioning \`.projectspace/tickets/3f2a9c1e-7b64-4d0a-9e51-0c8d2b7a44f1.md\`
  to show how an unbroken path behaves inside the reading measure.

## Research
Two passes so a title match always outranks a body-only one, while inside each group
the board's own order decides. That makes the result order deterministic without
inventing a relevance score. The same reasoning applies to dependencies: a
prerequisite in Verification satisfies a dependency without having been accepted.

| Field | Meaning |
| --- | --- |
| status | Where the ticket sits on the board |
| review | Whether a person has read the content |
| completion | Who decided it was done, and when |

## Verification
Run the checks, compare both colour schemes at a wide and a narrow window, and try
increased text size. Record what was actually run, and say plainly what was not.
`

export function stubTicketDetail(project: ProjectView, id: string): Result<TicketDetailView> {
  const found = project.tickets.find((t) => t.id === id)
  if (!found) {
    return {
      ok: false,
      code: 'not_found',
      message: 'That ticket no longer exists in this project.',
    }
  }

  return {
    ok: true,
    value: {
      ...found,
      body: BODY,
      plans:
        id === 'board' || id === 'writes'
          ? [
              {
                planId: '7c1e0f52-4b8a-4c1d-9e0f-3a5b6c7d8e9f',
                planTitle: 'MVP',
                phaseId: 'p2',
                phaseTitle: 'The board',
              },
            ]
          : [],
      createdAt: '2026-09-19T15:00:00Z',
      updatedAt: '2026-09-19T16:30:00Z',
      relatedDocuments: [
        'docs/architecture.md',
        'README.md',
        // Long enough to prove a path wraps rather than widening the dialog.
        'docs/decisions/0017-a-prerequisite-that-failed-verification-keeps-the-failure-on-its-own-record.md',
      ],
      /*
       * One reopened ticket, so the preview shows an acceptance that was taken
       * back. Only this one: a board where every ticket had been reopened would
       * not show how quiet the section is meant to be.
       */
      previousCompletions:
        found.id === 'editor'
          ? [
              {
                decisionSource: 'direct_user_action',
                recordedBy: 'user',
                recordedAt: '2026-09-18T09:00:00Z',
                instruction: 'Moved to Done in the app.',
                reopenedAt: '2026-09-19T14:00:00Z',
                reopenedTo: 'in_progress',
              },
            ]
          : [],
      dependencies: found.dependsOn.map((dependencyId) => {
        const prerequisite = project.tickets.find((t) => t.id === dependencyId)
        return prerequisite
          ? {
              id: dependencyId,
              title: prerequisite.title,
              status: prerequisite.status,
              satisfied: prerequisite.status === 'verification' || prerequisite.status === 'done',
              unreadable: false,
            }
          : { id: dependencyId, title: null, status: null, satisfied: false, unreadable: false }
      }),
    },
  }
}
