# Validation scenario results

The [specification](project-workspace-spec.md)'s nineteen-step validation scenario, run against the
product rather than read from the source. Recorded for ticket
`2e4a254f` ("Run the specification validation scenario end to end").

**Run on:** 2026-09-22, Windows 10 (`win32`).
**Against:** the shipped Node runtime from `apps/desktop/release/win-unpacked/resources/mcp/node.exe`
driving the freshly built `packages/mcp/dist/server.mjs`, spoken to over stdio as an external AI
client would. The `server.mjs` copy staged under `release/` is written at packaging time and lags
the source, so the current bundle was used instead.
**How:** two throwaway projects in a temp directory — a greenfield one and a folder that already had
a README and docs. No Electron process was started at any point. The run is scripted and was
reproduced twice with identical verdicts.

**Result: 14 pass, 2 fail, 3 not run here.**

The two failures are real product gaps, not scripting problems, and both now have tickets. The three
not-run steps are the ones that need a person at the window or another operating system; they are
listed with what is missing and who has to do it.

## Summary

| Step | Subject | Verdict |
| --- | --- | --- |
| 1 | Capture an idea and a specification in Markdown | pass |
| 2 | Create a few linked tickets | pass |
| 3 | A second AI tool retrieves a ticket and its context | **fail** |
| 4 | Verification, then Done on an explicit user instruction | pass (MCP half) |
| 5 | Pick the work back up from the records alone | pass |
| 6 | Readable outside the app; external edits picked up | pass |
| 7 | Onboard an existing application | pass (MCP half) |
| 8 | Progress while staying visibly unreviewed | pass |
| 9 | Authorization records and externally edited completions | **fail** |
| 10 | Windows, macOS and Linux | Windows only |
| 11 | Full workflow with the app closed | pass (headless half) |
| 12 | Transfer through Git and open the checkout | pass |
| 13 | Formatted editing | not run — no editor yet |
| 14 | Custom hierarchy and a blank document | pass |
| 15 | Inclusion in place, editing, removal from view | pass |
| 16 | Multiple prerequisites, missing refs, cycles | pass |
| 17 | Selecting next work, and nothing eligible | pass |
| 18 | Review reset on meaningful change | not run — needs the app |
| 19 | A prerequisite failing verification | pass |

## Failures

### Step 3 — a ticket's related documents are invisible

`ticket_create` accepts `related_documents`, and the record stores it: the ticket file on disk reads
`related_documents: [ "docs/spec.md" ]`. `ticket_read` never returns it. The keys it did return:

```
id, title, status, type, revision, depends_on, dependency_ready, dependency_notes,
verification_issue, affected_by, completion, completion_unattributed, previous_completions, body
```

Confirmed against this project's own ticket `1924aa96`, whose file records
`related_documents: ["README.md"]` and whose `ticket_read` does not mention it. `ticket_update` has
no parameter for the field either, so it is write-once and unreadable.

The step asks for a second tool to retrieve "one ticket **and the relevant context**". The second
tool could only read the document because the path was already known from the conversation, which is
the thing the step exists to rule out. Ticket `6a5ed3da`.

### Step 9 — an edited completion block is trusted

Two edits to the same Done ticket, measured through `ticket_list`:

| What was done to the file | `completion_unattributed` |
| --- | --- |
| Completion block deleted, `status: done` left behind | `true` — correct |
| Block kept, changed to `decision_source: direct_user_action` + `recorded_by: agent` | `false` |

`isUnattributedCompletion` (`packages/core/src/tickets/completion.ts:92-94`) is
`status === 'done' && completion === undefined`, so only the first case can ever be caught. The
forged block is returned as an ordinary completion, including a pair of values this write path can
never produce together: a direct in-app action is recorded by the user by definition.

This is not a broken security boundary. `completion.ts` already says a forged assertion is outside
what a local design can prevent, and that is a fair position. The gap is narrower and is in the same
docblock, which says completion recorded outside this path "is shown as unattributed" — true only
when the block is missing. Either the check or the sentence needs to change. Ticket `02e8bb8a`.

**Follow-up (2026-09-22, ticket `02e8bb8a`):** both changed. A block whose `decision_source` and
`recorded_by` contradict each other now counts as unattributed, in the app and through MCP alike,
and its claim is withheld (`completion: null`). A block hand-edited into one of the two producible
shapes is still not detected, deliberately: a fingerprint over the fields could be recomputed by
anything able to edit the file, so it would claim tamper evidence the design cannot back. The
reasoning is in `isUnattributedCompletion`'s docblock.

## Not run here

- **Step 10 — macOS and Linux.** Windows is covered by everything above. The other two are the
  user's own hardware; ticket `5ddb9586` covers them.
- **Step 13 — formatted editing.** There is no in-app formatted editor yet. Ticket `b217a95f` is
  blocked on a Milkdown release fixing inline-HTML loss (issue 2428).
- **Step 18 — review reset.** Recording a review is app-only by design: MCP exposes `review_status`
  to read and nothing to write. The reviewed → `changed_since_review` transition therefore cannot be
  set up from here at all. That is the design working as intended, but it leaves the step
  unvalidated. Ticket `25be0050`.

Four steps passed their MCP half with an in-app half left over (4, 6, 7, 11). Those are collected in
ticket `25be0050` rather than left implied.

## What passed, with the evidence

**Step 1.** `project_initialize` returned the project; `documents_include` registered `idea.md` and
`docs` in place; `document_read` returned the original Markdown with a revision. Creating the files
needed a separate file tool — see step 14.

**Step 2.** Three tickets, the third depending on the other two. It reported
`dependency_ready=false` with a note naming each prerequisite and its status.

**Step 4.** The ticket reached Verification with a handoff note. Recording completion with
`user_instructed_completion: false` was refused: *"Completion requires an explicit user instruction.
Reaching Verification, or reporting that checks passed, is not the user's decision to record."* With
the instruction supplied it became Done, and the file recorded
`decision_source: reported_user_instruction, recorded_by: agent` — the decision kept separate from
who wrote the file.

**Step 5.** A fresh connection read `project_get`, and `ticket_next` proposed the ticket whose
prerequisite had just finished. `project_search` found the recorded decision in `docs/spec.md`.

**Step 6.** A ticket file is plain Markdown with YAML frontmatter. A document edited by an external
editor was visible on the next `document_read`, with a new revision.

**Step 7.** Initializing over a folder that already had content, then including `README.md` and
`docs`: the README was byte-for-byte unchanged — not moved, not copied, no frontmatter added. An
uncertain claim in the existing architecture notes became a ticket rather than invented
documentation.

**Step 8.** `review_status` reported `unreviewed` before the work and still `unreviewed` after the
ticket moved to In progress. Progress does not imply or create a review.

**Step 11.** A ticket was read, moved to Verification and completed on an explicit instruction with
no GUI process ever started. The packaged suite separately proves the server runs with no Node on
PATH.

**Step 12.** The project was committed, cloned, and opened from the clone: it loaded from its files
alone. Creating a ticket in the clone left it uncommitted — `git status` went from one entry to two,
and no commit, stage, fetch or branch happened on its own. With unresolved conflict markers written
into one ticket file, `project_get` still answered, reported that record in `ticket_problems` as
`invalid_record`, and `ticket_list` still returned the three readable tickets.

**Step 14.** A nested folder the user invented was included as-is; an empty document read back as
`""` rather than erroring; `documents_list` returned four documents with no required section names.

**Step 15.** `document_write` updated the original file in place and preserved the surrounding
content. A second write against the stale revision was refused with `revision_conflict` naming the
current revision. `documents_remove` dropped an entry from the view and left the files on disk.

**Step 16.** With both prerequisites done, the dependent became ready. A dependency on an id that
does not exist reported *"depends on 9999…, which does not exist in this project"* and stayed not
ready. A two-ticket cycle reported *"is part of a dependency cycle: A -> B -> A"* on both members,
neither was ready, and `ticket_next` skipped both and proposed the genuinely eligible ticket.

**Step 17.** `ticket_next` proposed a ticket directly, with no extra confirmation step. In a project
where everything was blocked it returned `next: null` with the reason for each ticket, rather than
bypassing prerequisites or marking anything done.

**Step 19.** With the dependent already In progress, a verification issue was recorded on its
prerequisite. The dependent kept `status: in_progress` — no automatic rollback — and reported
`affected_by` naming the prerequisite, its title and the issue, leaving the rework decision to the
user.

## Gaps raised as tickets

| Ticket | Gap |
| --- | --- |
| `6a5ed3da` | Return a ticket's related documents through MCP |
| `02e8bb8a` | Flag a completion block that was edited outside the app |
| `fa05d99e` | Create a document through MCP |
| `25be0050` | Validate the in-app half of the specification scenario |

One further observation, not a product gap: the copy of the workflow skill installed at
`~/.claude/skills/projectspace` still says the backlog cannot be reordered through MCP.
`ticket_reorder_backlog` exists and this repository's `skills/projectspace/SKILL.md` documents it, so
only the installed copy is stale. Ticket `9f4177e9` covers bundling and distributing the skill.
