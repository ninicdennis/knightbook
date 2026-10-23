# Using Knightbook with AI tools

How to connect an AI client, what the app can and cannot observe about that
connection, the rules the code enforces, and how documents and links behave. The
[README](../README.md) covers running the project; the
[technical design](project-workspace-technical-design.md) is authoritative for why
it works this way.

## Connecting an AI tool

You add Knightbook to your AI client **once**, then choose in the app which
projects it may reach. The quickest path is **Set up your AI tool**: open a project,
click the MCP status in the bar along the bottom of the window, and choose it. The
steps below are what that dialog walks through.

1. Open a project and click the MCP status in the bottom bar.
2. Turn on **Allow AI access through MCP** for that project. Do the same in every
   project you want the AI to reach. Opening a project, or its appearing in recent
   projects, never turns this on by itself.
3. Use **Copy MCP configuration** and add it to your AI client. In a packaged
   install it points at the runtime shipped beside the application and at the app's
   list of allowed projects:

```json
{
  "command": "<installed-resources>/mcp/node.exe",
  "args": ["<installed-resources>/mcp/server.mjs", "--registry", "<app-data>/Knightbook/mcp-access.json"]
}
```

**This broadens what the client can reach.** Any AI client using that configuration
can read and change every project you have allowed, not only the one on screen.
Turn the setting off for a project to take it back; running clients lose it on
their next call, without restarting. Allowing a new project later needs no change
in the client.

The AI client starts the server itself, so access does not depend on the desktop
window being open. The AI picks a project with `projects_list`, passes its
`checkout_id` on every call, and each answer names the project it acted on. Clones
and worktrees of one project are listed separately by path. A folder that moved is
reported as unavailable, never quietly swapped for another copy; allow it again at
its new location. Technical design section 4 has the full model.

### Moving from one entry per project

Older setups added one client entry per project, each with `--root <folder>`. Those
keep working exactly as before, and each still reaches only its own folder. To move
to the single connection:

1. In the app, allow AI access for each project those entries pointed at.
2. Add the configuration from **Copy MCP configuration** as one new client entry.
3. Remove the old per-project entries from your client yourself, once the new one
   works. The app never edits your client's configuration.

### A configuration saved before the rename

The installed folder is named after the product, so a command saved while the app
was called Projectspace points at a path the current install does not use. The
client then fails to start the server rather than silently talking to the wrong
one. Use **Copy MCP configuration** again and replace the old entry. The name you
give the entry in your client's own config is yours and does not have to change;
the server reports itself as `knightbook`.

## What the status bar can and cannot tell you

The client starts and stops the server, so the app has no Start or Stop to offer
and does not pretend otherwise. What it does have is evidence: a server started for
one project writes a heartbeat into that project's `.projectspace/runtime/`
(coordination state, ignored by Git); a shared server writes its heartbeat beside
the app's list of allowed projects, and leaves a small "last used" record in each
project it actually works on. The window reads both.

| Indicator | What was observed |
| --- | --- |
| **MCP connected** | A server started for this project alone (`--root`) is running, and a client has opened a connection to it |
| **MCP available** | A client is connected through the shared configuration and this project is allowed. That is not proof it is working on this project; the details say when it last did |
| **MCP not allowed here** | A client is connected through the shared configuration, but this project is not allowed, so it cannot reach it |
| **MCP access unknown** | The list of allowed projects could not be read, so the shared connection reaches nothing. The file is left untouched |
| **MCP server running** | A server process is up, but no client has connected to it yet |
| **MCP not connected** | No running server was observed — not the same as one being stopped |
| **MCP runtime missing** | The bundled server is not where it should be, so the copied configuration would start nothing |
| **MCP status unknown** | The folder could not be read, so nothing could be observed at all |

Only a server from this build is visible. A client running a different build
against the same folder shows as no connection, which is why the wording is about
what was observed rather than about what is true.

## Teaching an AI tool the workflow

Connecting the server gives an AI the tools. The workflow skill tells it how to use
them: read the board, start work only when asked, hand off in Verification, and
never decide Done. It ships with the app, so no copy of the source repository is
needed. In **Set up your AI tool**, connecting the client and installing the skill
are separate steps:

- **Claude Code and Codex:** install into the folder each client documents reading
  skills from, either personal (`~/.claude/skills/projectspace`,
  `~/.agents/skills/projectspace`) or this project's (`.claude/skills/projectspace`,
  `.agents/skills/projectspace`, which Git will see). Each place shows whether it
  is missing, up to date, an older Knightbook install, or changed there.
- **An older copy** is updated only after you confirm, and only when it is still
  exactly what Knightbook installed. A copy that differs for any other reason may
  hold your edits, so the app never overwrites it; move it aside to install fresh.
- **Any other client:** **Export skill folder** writes a complete `projectspace`
  folder wherever you choose, and **Copy skill text** gives you the file to paste
  into that project's instructions (`AGENTS.md`, `CLAUDE.md`, a system prompt).
- **With nothing installed:** the server sends a short version of the core rules to
  every client when it connects, so an AI still learns the Done and review rules.

The app can see that the files are where a client looks. It cannot see whether the
client loaded them; ask the client which skills it has. The skill keeps its
`projectspace` name, as the `.projectspace/` folder does, because existing installs
refer to it by that name ([D-020](project-workspace-spec.md#accepted-decisions)).

None of this enforces the rules; MCP alone cannot. The next section is what the
code does enforce. `packages/mcp/src/guidance.test.ts` fails if the skill and the
real tool list drift apart.

## Plans

A plan is a roadmap, such as an MVP or a launch: freeform notes plus ordered
phases, each grouping existing tickets. The **Plans** tab shows every plan with its
phases, linked tickets and progress; clicking a ticket opens it. A ticket's own
dialog lists the plans and phases it belongs to, and each one opens that plan.

Create a plan with **New plan**, then **Add phase**. Each phase's menu renames,
moves or removes it, the field under its tickets attaches a board ticket, and the
cross beside a ticket detaches it. An AI tool can do the same with `plan_create`
and `plan_update`. The plan's notes are edited in the file itself, with **Edit
externally**. If the plan changed somewhere else since the pane read it, your change
is not applied and the pane shows the current version.

Progress is read from the tickets every time, so it cannot drift from the board.
Each ticket counts once per plan, Verification is shown apart from Done, a
reference to a ticket that is missing or unreadable is shown as such and never
counted as done, and a plan or phase with no tickets reads as nothing planned
rather than finished. Linking a ticket to a phase changes nothing on the ticket.

## Routines

A routine is recurring work, such as a weekly package review or a monthly security
check, kept as instructions that stay put however many times the work is done. The
**Routines** tab lists them. Create one with **New routine**, and change its title
or instructions with **Edit**.

**Start run** creates a Backlog ticket with a copy of the routine's title and
instructions. It is an ordinary ticket: work it, hand it off in Verification, and
accept it when you are satisfied. Editing the routine later does not change runs
already started. If a run is still open, Start run asks before making a second one
and offers to open the open run instead. An AI tool can do the same with
`routine_create`, `routine_update` and `routine_start_run`, and reads routines with
`routine_list` and `routine_read`.

The routine's history lists its runs, newest first, and when each was accepted. It
is read from the run tickets, so a run in Verification reads as not accepted yet,
and a Done ticket with no recorded acceptance is shown as exactly that. The
instructions can say "weekly", but Knightbook never starts a run on its own; that
is up to you or a scheduler you run yourself.

## Three rules the code enforces

**Only the user decides completion.** `ticket_update` cannot set a ticket to Done,
and Done is absent from the board's move menu. Recording completion goes through
`ticket_record_user_completion`, which is valid only from Verification and requires
an explicit assertion that the user instructed it. The provenance is honest: an
agent-written update records `decision_source: reported_user_instruction` and the
card reads "Recorded by AI", never "Accepted by you".

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
earlier review; reformatting and status changes do not. The system reports that the
content changed and explicitly declines to say whether the meaning did.

**Writes are checked against what the caller read.** Every mutation re-reads the
file under a lock shared by the app and the MCP process, compares exact bytes
against the caller's revision, and replaces through a temporary file. A stale write
returns a conflict with the current revision instead of overwriting newer content,
and the board reloads and says the move was not applied. External editors and Git
do not honor the lock; the revision check is what actually prevents a lost update.

## Documents

### Existing documents stay where they are

Including a file or folder records a project-relative path in the manifest. It
never copies, moves, or rewrites the document, and it does not add frontmatter to
one just to register it. Removing something from the workspace deletes nothing —
it drops a manifest entry. A path that stops resolving is reported as a problem
rather than quietly disappearing from the list.

### Reading documents safely

The Documents view renders included Markdown for reading. It is read-only for now;
editing stays in your own editor through **Edit externally**, on documents and on
tickets, which hands the file to the operating system's registered handler rather
than executing anything itself.

Document content is untrusted input, per technical design section 1:

- Markdown is parsed, then sanitized with DOMPurify. Scripts, event handlers,
  `iframe`/`object`/`embed`/`form`, and inline styles are stripped before anything
  reaches the DOM.
- Every link is classified before rendering. An `http(s)` link becomes an
  external-open action gated on an explicit click. Every other scheme — `file:`,
  `javascript:`, `data:`, protocol-relative, or an absolute path — is shown as inert
  text with a visible note, never as a clickable `href`. `markdown.test.tsx` asserts
  each of these cases directly.
- Only images inside the project are shown, and a document still cannot cause a
  network request just by being opened. A relative image path, in Markdown
  (`![alt](path)`) or a raw `<img src>`, is resolved against the file it is written
  in, the same way a link is. The host then shows it only if it is inside the
  project (symlinks included), is a PNG, JPEG, GIF or WebP by its bytes rather than
  its name, and is 5 MB or smaller; the window receives it as a data URL, never a
  file path. SVG is never shown, because it can carry scripts. Remote (`http`,
  `https`, `//`) and `data:` images are never requested. Any image that is not
  shown keeps a placeholder saying why. Showing an image reads the file and records
  nothing, not even a review.
- Frontmatter is shown separately from the rendered body, never treated as prose.

### Linking between documents and tickets

A relative link opens in the app. It is read the way any Markdown editor reads it,
relative to the file it is written in, and the host then checks what it reaches: an
included document opens under Documents, a ticket file opens that ticket, and
anything else (outside the project, not included, not Markdown, missing) says why
instead of doing nothing. Following a link includes nothing and changes no status
or review. After following one, **Back to …** returns to where you were.

The app keeps a history of where you have been in the open project, as a browser
does. **Back** and **Forward** sit at the start of the view tabs, and the mouse's
side buttons, Alt+← / Alt+→ (Windows and Linux) and Cmd+[ / Cmd+] (macOS) do the
same. A place that has since gone, such as a deleted document or an archived
ticket, is skipped and the app says so. History starts again when you open another
project, and is never saved.

Link to a heading with a GitHub-style fragment: lowercase, punctuation dropped,
spaces as hyphens, and `-1`, `-2` for a repeated heading. `#acceptance-criteria`
reaches `## Acceptance criteria`, in the same file or another one.

| From | To | Write |
| --- | --- | --- |
| `docs/overview.md` | `docs/spec.md` | `[spec](spec.md)` |
| a ticket | `docs/research/ui-ux-design-direction.md` | `[direction](../../docs/research/ui-ux-design-direction.md)` |
| a ticket | another ticket | `[other](<other ticket id>.md)` |
| `README.md` | a ticket | `[ticket](.projectspace/tickets/<id>.md)` |

Ticket files live in `.projectspace/tickets/`, which is why a ticket reaches the
repository root with `../../`. A bare ticket id in prose stays prose; it is not
turned into a link. A ticket's id is shown in its dialog, with a control that
copies the whole id.
