---
schema_version: 1
id: c0e361ae-fb0a-4bf8-a76f-53cc21a8a1bc
title: "MCP server exposing the section 9 operations over stdio"
status: done
depends_on: []
created_at: 2026-09-19T20:05:15.070Z
updated_at: 2026-09-19T21:35:33.372Z
related_documents: [ "docs/project-workspace-technical-design.md" ]
completion:
  decision_source: direct_user_action
  recorded_by: user
  recorded_at: 2026-09-19T21:35:33.372Z
  instruction: Moved to Done in the app.
  accepted_revision: b013447a894ab471db9e90c75dd5fae1
---

# MCP server

## Intended outcome
A separately launchable stdio server so an AI client can read and update projects with the desktop window closed (D-008).

## Acceptance criteria
- The root is bound at launch with --root, never taken from tool input.
- Fourteen tools: the ten in the section 9 table plus ticket_next, ticket_read, documents_list and review_status.
- No tool exists for an agent to record human review (D-003).

## Verification
Checked by the AI, not accepted by the user. 22 packaging tests drive it over real stdio, including against the packaged build with no Node on PATH and no GUI running. This project is itself being built through that server.
