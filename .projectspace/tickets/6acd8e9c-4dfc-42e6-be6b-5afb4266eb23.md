---
schema_version: 1
id: 6acd8e9c-4dfc-42e6-be6b-5afb4266eb23
title: "Stage the matching Node runtime for each release target"
status: backlog
depends_on: []
created_at: 2026-09-19T20:05:15.184Z
updated_at: 2026-09-19T20:05:15.184Z
related_documents: ["docs/experiments/packaging-findings.md","docs/release-automation.md"]
---

# Per-target runtime staging

## Intended outcome
Release builds ship the Node runtime that matches each OS and CPU.

## Acceptance criteria
- Staging selects or downloads the right runtime with a verified checksum.
- Executable permission is preserved; macOS arm64 and x64 are not built from one host copying its own Node.
- Documented in the packaging findings.

## Notes
stage-mcp-runtime.mjs copies the build host's Node, which is only correct for the host platform.
