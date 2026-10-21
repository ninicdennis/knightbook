---
schema_version: 1
id: 1aefd5aa-2cba-4c3d-ad91-fdfb769b98e2
title: "Write the privacy page"
status: verification
type: documentation
depends_on: [ "1e8e5e3b-41b2-4463-b344-784e8a72ab89", "577513c8-4a21-4014-ba6e-bc51fdb35294", "c125336d-16c3-4f70-8a76-0b6e00a2be10" ]
created_at: 2026-09-30T02:39:30.679Z
updated_at: 2026-10-21T15:28:51.163Z
related_documents: [ "docs/proposals/landing-page-and-user-documentation.md", "docs/project-workspace-technical-design.md" ]
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

## Handoff (2026-10-21)

### What changed
- New `/privacy/` page with four sections (This website, The desktop app, The AI tool you connect, Getting help) plus who to ask, and a "Last updated" date.
- Footer utility row: Privacy, License, Support (GitHub Issues' new-issue chooser) and Source code.

### Sources for each statement
- Website: GitHub Pages logs every visitor's IP address "for security purposes" (docs.github.com, "What is GitHub Pages?", read 2026-10-21); host per D-044. "No analytics, no cookies, nothing loaded from other sites": the site ships no JavaScript (tested), and a scan of every built page found no `src`/`href` to another origin for scripts, styles, images or frames.
- Desktop app: a search of `apps/desktop/src`, `packages/core/src` and `packages/mcp/src` for `fetch(`, `net.request`, `http(s).request`, `autoUpdater`, `electron-updater`, `crashReporter`, telemetry and analytics found none. Links open externally only through `shell.openExternal` on a click. The renderer's Content-Security-Policy is `default-src 'self'; img-src 'self' data:`, and D-034 limits images to in-project files. Local state: `app-state.json` (settings, recent projects), `mcp-access.json` (allowed projects) under the app's user-data folder, window placement, and `.projectspace/` in each project.
- Spell checker: Electron's documentation (electronjs.org/docs/latest/tutorial/spellchecker) says it is on by default and Hunspell dictionaries download from a Google CDN on Windows and Linux. Not measured; the page says so, and ticket 89cbeecf settles it.
- AI tool: the app has no AI assistant; the MCP server runs locally over stdio. What the client and provider do is outside the app.
- Support: GitHub Issues and private vulnerability reporting per D-045.

### How it was checked
Website suite with Chromium: 161 passed, including axe and phone width for `/privacy/`, a test for the four section headings and date, the three key statements, and the absence of unsupported claims ("no data collection", "zero data", "fully offline", "secure by default"); and the footer row on four pages. Typecheck clean. The verifier was not run.

### Not verified
- No legal review (the ticket's own note: the user decides whether one is needed).
- The spell-checker download, as above.
- That GitHub's privacy statement link is the current URL for the general privacy statement.

### For you to check
Read the page as a visitor would. In particular, whether you are comfortable with the spell-checker paragraph, or would rather turn spell checking off first (89cbeecf).
