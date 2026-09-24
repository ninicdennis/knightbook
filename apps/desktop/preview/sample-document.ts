/** Exercises the reader's supported syntax and its refusal cases in one page. */
export const SAMPLE_DOCUMENT = `---
schema_version: 1
title: Architecture notes
owner: denny
---

# Architecture notes

The resolver rejects traversal outside the project root, and re-checks the
**real path** after symlinks so a junction cannot escape the checkout.

## Record layout

| Field | Purpose | Required |
| --- | --- | --- |
| \`schema_version\` | Refuse unsupported versions | yes |
| \`id\` | Stable UUID, independent of filename | yes |

## Readiness

- A ticket with no prerequisites is ready.
- Every prerequisite must reach \`verification\` or \`done\`.
- Cycles produce an explanation instead of an eligible ticket.

\`\`\`ts
export function isReady(ticket: Ticket, all: Map<string, Ticket>): boolean {
  return ticket.dependsOn.every((id) => SATISFYING.has(all.get(id)?.status ?? ''))
}
\`\`\`

> Verification unlocks dependent work. It does not mean the user accepted it.

## Links

An [internal link](../README.md) opens in the app. An
[external link](https://modelcontextprotocol.io) opens in your browser on click.
A [file link](file:///C:/Windows/System32/config) is refused, and so is a
[script link](javascript:alert(1)).

![a diagram](./diagram.png)
`
