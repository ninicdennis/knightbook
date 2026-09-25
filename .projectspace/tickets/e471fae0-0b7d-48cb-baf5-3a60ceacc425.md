---
schema_version: 1
id: e471fae0-0b7d-48cb-baf5-3a60ceacc425
title: "Flag dependents when a prerequisite fails verification (D-017)"
status: done
depends_on: []
created_at: 2026-09-19T20:05:15.168Z
updated_at: 2026-09-25T18:28:05.901Z
related_documents: [ "docs/project-workspace-spec.md", "docs/project-workspace-technical-design.md" ]
completion:
  decision_source: direct_user_action
  recorded_by: user
  recorded_at: 2026-09-20T14:24:45.371Z
  instruction: Moved to Done in the app.
  accepted_revision: 7ce23ce62079e579aa84899ee347e1cb
archived:
  archived_at: 2026-09-25T18:28:05.900Z
---

# Failed-prerequisite flag

## Intended outcome
When a prerequisite fails verification, tickets that depend on it are flagged with an explanation. Nothing is reset automatically.

## Acceptance criteria
- The failure is persisted on the prerequisite (design section 5) with the reason.
- Dependents show a derived affected-work flag in the app and through MCP.
- ticket_next stops suggesting affected work until the user resolves the issue.
- Downstream statuses are never changed automatically.

## Notes
Not implemented. Only a ticket's own blocker exists today.

## Handoff

**What changed:** A failed verification is now a record on the ticket that failed, and an affected-work flag derived for everything resting on it.

- `packages/core/src/schema.ts` adds an optional `verification_issue` to ticket frontmatter: the user's `reason`, plus the same provenance triple `completion` carries (`decision_source`, `recorded_by`, `recorded_at`).
- `packages/core/src/verification.ts` (new) holds `recordVerificationIssue` and `resolveVerificationIssue`. Recording is valid only from Verification, requires the caller to assert the user reported it, and requires a reason. Resolving requires the user's decision too. Neither writes to any other ticket.
- `packages/core/src/dependencies.ts` adds `failedPrerequisites()`, a breadth-first, cycle-safe walk up the `depends_on` graph, and a `prerequisite_failed_verification` ineligibility reason. `evaluateReadiness` now fails on it, which is what makes `ticket_next` skip affected work. Because the reason is derived from the prerequisite's own record, this takes precedence over that prerequisite sitting in Verification.
- `packages/mcp/src/tools.ts` exposes `verification_issue` and `affected_by` on every ticket summary, plus two tools: `ticket_record_verification_issue` and `ticket_resolve_verification_issue`.
- The app shows both states, kept deliberately separate: a "Failed verification" badge on the ticket that failed and an "Affected by a failure" badge on work resting on it, with fuller alerts in the detail view (`VerificationIssueNotice.tsx`). The detail view's Depends-on list now says "failed verification, so it does not unlock this" instead of "satisfies this dependency" for such a prerequisite.
- Recording and resolving are also direct user actions in the app: a card-menu item opens a dialog for the reason (`VerificationIssueDialog.tsx`), routed through new IPC handlers in `apps/desktop/src/main/ipc.ts`.
- `skills/projectspace/SKILL.md` documents the new fields and tools. `docs/project-workspace-technical-design.md` section 5 records the transitions as built.

**How it was checked:** `pnpm check` (oxlint, prettier, tsc across all packages, and the full test suite) passes: 299 tests, 0 failures. 12 new core tests in `packages/core/src/verification.test.ts` and 4 new renderer tests in `apps/desktop/src/renderer/VerificationIssue.test.tsx` cover the acceptance criteria directly, including that a dependent's status is untouched after its prerequisite fails, that the walk terminates on a dependency cycle, that a general `ticket_update` cannot set or clear the field, and that `ticket_next` resumes suggesting the work only once the issue is resolved.

The board was also exercised in the design preview (`pnpm preview:board`) with a failed prerequisite and a dependent: both cards stayed in the columns they were already in, both badges rendered, and the reason dialog refuses an empty reason.

**Not verified:** The packaged Electron app was not rebuilt or launched; the UI was checked in the Vite design preview against stub data, not in Electron. The MCP tools were not called against a live client either -- the packaged `server.mjs` under `release/win-unpacked` is the pre-existing build and does not include these tools until `pnpm build:mcp` runs. Behaviour of the two new tools is covered by the core tests underneath them, not by an end-to-end MCP call. Light colour scheme was not reviewed; only dark.

**For you to check:** On the board, that a ticket which failed verification and its dependents read honestly to you -- particularly that nothing looks like it was reset. In the detail view of an affected ticket, that the wording makes clear the decision about what to rework is yours. Whether recording the failure should also be possible from Done (deliberately refused here; reopening a Done ticket is its own backlog ticket).
