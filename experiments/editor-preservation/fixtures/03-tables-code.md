# Storage layout

| Field | Purpose | Required |
| --- | --- | --- |
| `schema_version` | Refuse unsupported versions | yes |
| `id` | Stable UUID, independent of filename | yes |
| `depends_on` | Prerequisite ticket IDs | no |

Some prose between the table and the code.

```ts
export function isDependencyReady(ticket: Ticket, all: Map<string, Ticket>): boolean {
  if (ticket.dependsOn.length === 0) return true
  return ticket.dependsOn.every((id) => {
    const prerequisite = all.get(id)
    return prerequisite?.status === 'verification' || prerequisite?.status === 'done'
  })
}
```

```json
{
  "command": "<installed-resources>/mcp/node.exe",
  "args": ["<installed-resources>/mcp/server.mjs", "--root", "<selected-project>"]
}
```

Trailing paragraph.
