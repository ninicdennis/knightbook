---
schema_version: 1
id: 0f9c2b1e-5a7d-4c33-9b21-8e6f4a0d1c77
title: Add dependency readiness check
status: verification
depends_on:
  - 3a1b7c92-0d4e-4f18-8a52-c6b9e2f3d014
created_at: 2026-09-01T10:15:00Z
updated_at: 2026-09-18T20:53:00Z
related_documents:
  - 7c4d9e21-6b83-4a05-91f7-2d5e8c0b3a66
custom_field_we_do_not_own: keep me
---

# Add dependency readiness check

## Acceptance criteria

- A ticket with no prerequisites is dependency-ready.
- Every prerequisite must be in `verification` or `done`.
- Cycles produce an explanation instead of an eligible ticket.
