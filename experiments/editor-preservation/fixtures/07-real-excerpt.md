## Proposed first-version scope

| Area | Proposed behavior |
| --- | --- |
| Desktop platforms | Deliver the core project, documentation, board, review, and MCP workflows on Windows, macOS, and Linux. Exact supported OS versions and processor architectures remain open. |
| Projects | Create or open a project through the UI or MCP in a user-selected folder, including an existing application, and switch between known projects. The structure added inside that folder remains open. |
| Documents | Browse, read, edit, and organize Markdown in user-defined documents and folders, with optional starter templates. Include selected existing files in place. A formatted editor is the tentative default; an in-app source editor is not yet a requirement. |
| Board | View tickets by status and open their Markdown content. The working flow is Backlog → In progress → Verification → Done. The user decides completion in the app or instructs AI to record it through MCP. Other transition details remain open. |
| Connections | Link tickets to the documents and decisions needed to understand them. |
| Dependencies | Link tickets to prerequisites and show their current status in the app and MCP. Verification or Done satisfies a prerequisite. Flag affected work if verification fails; leave rework decisions to the user. Explicit overrides remain open. |
| Retrieval | Find relevant project content without requiring an AI to read every document. The initial search behavior remains open. |
| MCP | Expose project/document/ticket retrieval and updates against the same content used by the UI, including while the app window is closed. Exact operations and process lifecycle remain open. |
| Workflow guidance | Likely provide a companion skill explaining how to read project context, capture decisions, develop tickets, and record handoffs. Exact delivery remains open. |
| Continuity | Record enough task context and progress for another tool to continue, including unresolved questions. |
| Human review | Track human validation in the app and expose it through MCP without blocking work. Exact granularity remains open. |

## Desktop platform support

Accepted direction: Windows, macOS, and Linux are all first-version requirements.

Proposed acceptance requirements:

- Install and run the application and connect an external AI client through MCP on each supported platform.
- Keep project Markdown and record conventions portable across the three platforms, including links within a project.
- Validate opening projects, editing documents, detecting external edits, using the board, and completing user verification on each platform.
- Define supported OS versions, processor architectures, and Linux packaging targets before release. These have not been selected.

## Git and project portability

Accepted direction: Git carries project content between machines. The user manages their repository and opens the local checkout in the app after cloning or pulling it.

- Store durable project documentation and ticket state in the selected project folder so the user can version them alongside the application.
- Leave commits, pulls, pushes, and Git conflict resolution to the user's existing Git workflow. Automatic Git operations are outside the first-version scope.
