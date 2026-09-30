---
schema_version: 1
id: 1aefd5aa-2cba-4c3d-ad91-fdfb769b98e2
title: "Write the privacy page"
status: backlog
type: documentation
depends_on: ["1e8e5e3b-41b2-4463-b344-784e8a72ab89","577513c8-4a21-4014-ba6e-bc51fdb35294","c125336d-16c3-4f70-8a76-0b6e00a2be10"]
created_at: 2026-09-30T02:39:30.679Z
updated_at: 2026-09-30T02:39:30.679Z
related_documents: ["docs/proposals/landing-page-and-user-documentation.md","docs/project-workspace-technical-design.md"]
---

# Write the privacy page

## Intended outcome
`/privacy/` accurately and narrowly explains what data the website, the desktop app, the connected AI client, and support submissions each involve.

## Acceptance criteria
- Four separate sections: the website (what the chosen host logs and keeps, and that no analytics script is used, without saying "no data collection"); the desktop app (project data stays in the chosen folder; any network use the app makes is described as verified in code); the connected AI client (Knightbook does not control what the user's AI provider receives); support submissions (what happens to what users send).
- Every statement is checked against the host decision, the app's code, or the support decision, and the source of each is noted on this ticket.
- The page shows its last-updated date.
- Makes no claim the evidence does not support, such as "zero data leaves your device".

## Notes
Spec §9: review hosting logs before writing, and keep website, desktop and AI-provider data separate. This is not legal review; the user decides whether one is needed.
