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
`

export function stubTicketDetail(project: ProjectView, id: string): Result<TicketDetailView> {
  const found = project.tickets.find((t) => t.id === id)
  if (!found) {
    return { ok: false, code: 'not_found', message: 'That ticket no longer exists in this project.' }
  }

  return {
    ok: true,
    value: {
      ...found,
      body: BODY,
      createdAt: '2026-09-19T15:00:00Z',
      updatedAt: '2026-09-19T16:30:00Z',
      relatedDocuments: ['docs/architecture.md', 'README.md'],
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
