# Projectspace

A desktop workspace for developing project ideas, preserving decisions, and
tracking implementation on a Kanban board, where humans and different AI tools
share durable context through ordinary Markdown files.

Built from [the product specification](docs/project-workspace-spec.md) and
[technical design](docs/project-workspace-technical-design.md). Those documents
are authoritative; this README describes what exists so far.

## Status

The two experiments technical design section 11 asks for before building out the
product are complete. The shared core library and the MCP server work end to end
against a real packaged build, and the board is built on Mantine around that
verified path.

| Area | State |
| --- | --- |
| Editor preservation experiment | Complete — [findings](docs/experiments/editor-preservation-findings.md) |
| Packaging smoke test | Complete on Windows — [findings](docs/experiments/packaging-findings.md) |
| Shared core library | Safe writes, records, dependencies, completion, documents, search, review |
| MCP surface | Fourteen tools: the ten section 9 operations plus ticket_next, ticket_read, documents_list and review_status; packaged and validated |
| Desktop board | Four columns, drag and menu moves, a ticket detail dialog, a project switcher, one-click setup for a folder with no project yet, completion and review with provenance, refresh (button, and whenever the window regains focus); a malformed ticket or merge conflict is listed instead of blocking the board |
| Document viewer | Read-only rendering of included documents, in-app review, external-editor handoff |
| AI workflow guidance | A portable skill file plus rules sent by the server on connect; not yet exercised in a real AI session |
| Continuous integration | A GitHub Actions workflow lints, format-checks, typechecks, tests, builds and packages every pull request on Windows, Linux and macOS; green on all three. It reports results but is not yet a required check |
| Human review tracking | Tracked and surfaced for both tickets and documents, in the app and through MCP |
| Document editing | Not started — the formatted editor is blocked on the Milkdown finding; reading works now |
| macOS and Linux | Built, packaged and tested in CI, including the bundled MCP server run from the package. The app window has not been launched on either, and no installer has been built |

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request to
`main` and every push to `main`, on Windows, Linux and macOS. In order, it installs
with the frozen lockfile, builds the MCP bundle, runs `pnpm check` (lint, formatting,
typecheck, every test suite), packages the desktop app, and reruns the packaging tests
against that real package with `REQUIRE_PACKAGED_APP=1`, so they fail rather than
skip if the package is missing. To run the same steps locally:

```bash
pnpm install --frozen-lockfile && pnpm build:mcp && pnpm check && pnpm pack:dir
REQUIRE_PACKAGED_APP=1 pnpm --filter @projectspace/experiment-packaging test
```

The workflow has read-only access, no secrets, and publishes nothing; actions are
pinned to commit SHAs. It reports results but cannot stop a merge by itself. Making it
required is a branch-protection setting in the repository's GitHub settings.

Future delivery work: [releases after merge](docs/release-automation.md) compares
GitHub release tooling and proposes an automated build-and-publish workflow.
It is deferred; no release automation is enabled yet.

## Requirements

Node 24 and pnpm. `corepack enable` provides pnpm.

## Commands

```bash
pnpm install
pnpm check
```

`pnpm check` runs the linter (Oxlint), the formatting check (Prettier), typecheck, and
every test suite. `pnpm format` rewrites files to the project style; it leaves Markdown
and the `.projectspace/` records alone. Other useful commands:

```bash
pnpm pack:dir
```

Builds the MCP server and produces an unpacked desktop application under
`apps/desktop/release/`. The packaging tests use it when present and skip
themselves when it is absent.

```bash
pnpm experiment:editor
```

Prints the Markdown preservation evidence table for the pinned Milkdown version.

```bash
pnpm preview:board
```

Serves the board against stub data at `http://localhost:5199`, for reviewing
layout without packaging the app. Not part of any shipped build.

## Layout

```text
packages/core      Records, safe writes, dependencies, completion, documents, search, review
packages/mcp       The separately launchable stdio MCP server
apps/desktop       Electron app: main process, preload bridge, Mantine board
skills/            The workflow skill that teaches AI tools how to use the MCP tools
experiments/       The two section 11 experiments, kept as regression tests
docs/              Specification, technical design, and experiment findings
```

`packages/core` is loaded by both the desktop host and the MCP server, which is
what keeps the two from validating the same records differently. The renderer
reaches the host only through the named operations in `src/shared/contract.ts`;
it has no filesystem or shell access.

## Connecting an AI tool

The header's plug button copies this project's MCP configuration. In a packaged
install it points at the runtime shipped beside the application:

```json
{
  "command": "<installed-resources>/mcp/node.exe",
  "args": ["<installed-resources>/mcp/server.mjs", "--root", "<your-project-folder>"]
}
```

The AI client starts that process itself, so project access does not depend on
the desktop window being open. The root is bound at launch rather than supplied
per call, so a connection reaches exactly one checkout.

## Teaching an AI tool the workflow

Connecting the server gives an AI the tools. [`skills/projectspace/SKILL.md`](skills/projectspace/SKILL.md)
tells it how to use them: read the board, start work only when asked, hand off in
Verification, and never decide Done. It is plain Markdown, so it works in any client.

- **Claude Code:** copy the `skills/projectspace` folder into your personal skills
  folder (`~/.claude/skills/`), or into a project's `.claude/skills/`. It is used
  automatically when the `projectspace` tools are connected.
- **Any other client:** paste the file into that project's instructions
  (`AGENTS.md`, `CLAUDE.md`, a system prompt).
- **With nothing installed:** the server sends a short version of the core rules to
  every client when it connects, so an AI still learns the Done and review rules.

None of this enforces the rules; MCP alone cannot. See the three rules below for
what the code does enforce. `packages/mcp/src/guidance.test.ts` fails if the skill
and the real tool list drift apart.

## Three rules the code enforces

**Only the user decides completion.** `ticket_update` cannot set a ticket to
Done, and Done is absent from the board's move menu. Recording completion goes
through `ticket_record_user_completion`, which is valid only from Verification
and requires an explicit assertion that the user instructed it. The provenance is
honest: an agent-written update records `decision_source: reported_user_instruction`
and the card reads "Recorded by AI", never "Accepted by you".

This is a cooperative rule backed by provenance, not a tamper-proof gate. A
file-writing agent can edit the Markdown directly. A Done status with no recorded
decision is shown as **Unattributed** rather than silently trusted.

**Only the user records a review.** There is no MCP tool to mark content
human-validated — the capability does not exist, rather than existing behind an
instruction not to use it. `review_status` is read-only, so an AI can report
review accurately but never claim it.

Review never blocks work: an unreviewed ticket moves through implementation and
completion normally. What it cannot do is look reviewed. Content is
**Unreviewed**, **Changed since review**, or quiet, and those are three different
things. A meaningful edit returns reviewed content to "changed" while keeping the
earlier review; reformatting and status changes do not. The system reports that
the content changed and explicitly declines to say whether the meaning did.

**Writes are checked against what the caller read.** Every mutation re-reads the
file under a lock shared by the app and the MCP process, compares exact bytes
against the caller's revision, and replaces through a temporary file. A stale
write returns a conflict with the current revision instead of overwriting newer
content, and the board reloads and says the move was not applied. External
editors and Git do not honor the lock; the revision check is what actually
prevents a lost update.

## Existing documents stay where they are

Including a file or folder records a project-relative path in the manifest. It
never copies, moves, or rewrites the document, and it does not add frontmatter to
one just to register it. Removing something from the workspace deletes nothing —
it drops a manifest entry. A path that stops resolving is reported as a problem
rather than quietly disappearing from the list.

## Reading documents safely

The Documents view renders included Markdown for reading. It is deliberately
read-only for now — editing stays in your own editor via the **Edit externally**
button, which hands the file to the OS-registered handler rather than executing
anything itself.

Document content is untrusted input, per technical design section 1:

- Markdown is parsed, then sanitized with DOMPurify. Scripts, event handlers,
  `iframe`/`object`/`embed`/`form`, and inline styles are stripped before
  anything reaches the DOM.
- Every link is classified before rendering. A relative link to another
  included document becomes an in-app navigation; an `http(s)` link becomes an
  external-open action gated on an explicit click. Every other scheme —
  `file:`, `javascript:`, `data:`, protocol-relative, or an absolute path — is
  shown as inert text with a visible note, never as a clickable `href`.
  `markdown.test.tsx` asserts each of these cases directly.
- Images are not fetched. A document cannot cause a network request just by
  being opened.
- Frontmatter is shown separately from the rendered body, never treated as
  prose.
