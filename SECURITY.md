# Security

## Reporting a vulnerability

Report it privately through GitHub:
[Report a vulnerability](https://github.com/ninicdennis/knightbook/security/advisories/new).
Do not open a public issue for it.

Say which version you used, on which operating system, and how to reproduce the
problem. Leave out private project content and credentials; describe them instead.

Knightbook is maintained by one person, so there is no fixed response time. You
will get an answer in the advisory, and a fix is credited to you there unless you
would rather it was not.

## Supported versions

Only the newest release gets fixes. Install it from the download page before
reporting, if you can.

## What is in scope

- The desktop app, including how it renders Markdown, links and images from a
  project (document content is treated as untrusted; see D-034 in the
  [specification](docs/project-workspace-spec.md)).
- The bundled MCP server, including which projects it lets an AI client reach.
- The release workflow and the installers it publishes.

What an AI client or its provider does with what it reads is outside Knightbook's
control and outside this policy.
