---
schema_version: 1
id: 89cbeecf-cca4-4aac-9476-f8f41a3ebc25
title: "Decide whether the app may download spell-check dictionaries"
status: backlog
type: task
depends_on: []
created_at: 2026-10-21T15:28:35.218Z
updated_at: 2026-10-21T15:28:35.218Z
related_documents: ["docs/project-workspace-spec.md"]
---

# Decide whether the app may download spell-check dictionaries

## Intended outcome
The privacy page can say exactly what network traffic the app makes, because the one known source of it is either measured or switched off.

## Acceptance criteria
- On Windows and Linux, whether the packaged app requests Hunspell dictionaries from Google when a text field is used is measured, with how it was measured.
- The owner decides: keep it, point it elsewhere with `session.setSpellCheckerDictionaryDownloadURL`, or turn spell checking off; the choice is recorded as a numbered decision.
- The privacy page states the outcome instead of "we have not measured".

## Notes
Created 2026-10-21 while writing the privacy page (1aefd5aa). The app's own code makes no network requests (no fetch, net.request, updater or crash reporter), but Electron enables its spell checker by default from version 9, and its documentation says Hunspell dictionaries are downloaded from a Google CDN by default; macOS uses the native spell checker. Changing it changes the app, so its merge releases a new version (D-041).