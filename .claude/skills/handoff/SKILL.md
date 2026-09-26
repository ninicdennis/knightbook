---
name: handoff
description: End-of-ticket steps before moving a Knightbook ticket to Verification in this repository - checks, MCP bundle, a board layout pass at two widths, the verifier, and the handoff note. Use when the work on a ticket is finished and before calling ticket_update with status verification.
---

# Handing off a ticket

Run these in order. Stop and fix anything that fails before going on. Rules and
commands are in AGENTS.md; this is the order to apply them in at the end of a
ticket.

1. **Checks.** `pnpm check`. It must pass. If it skipped the packaged-app tests
   because nothing was packaged, that is a skip, not a pass: note it under
   "Not verified".

2. **MCP bundle.** If anything under `packages/mcp` or `packages/core` changed,
   run `pnpm build:mcp`. A connected client keeps running its old build until it
   reconnects; say so if the change affects tool behaviour.

3. **Layout pass.** If anything under `apps/desktop/src/renderer` changed, look at
   it in a real browser, not only in tests:
   - start the board preview (`pnpm preview:board`, or the `board-preview`
     configuration in `.claude/launch.json`);
   - check it at a narrow width (about 800px) and a wide one (about 1600px), in
     both colour schemes (`?light` for light);
   - compare against `docs/research/ui-ux-design-direction.md`: surfaces, type
     scale, spacing, status colours, nothing cramped or clipped;
   - take a screenshot of what changed. The preview uses stub data, so behaviour
     that needs a real project is "Not verified" unless it was checked in the app.

4. **Verifier.** Run the `verifier` subagent with the ticket id. For every
   criterion it reports as weakly covered or uncovered, either close the gap or
   list it under "Not verified" with its reason. Do not paraphrase its verdicts
   upward.

5. **Handoff note.** Append it to the ticket body through `ticket_update` (read
   the ticket first; the body is replaced whole), with these four headings, as
   the projectspace skill describes:
   - **What changed**
   - **How it was checked:** the commands and what they showed, the widths
     looked at, the verifier's counts
   - **Not verified:** specific, including skipped tests and anything seen only
     against stub data
   - **For you to check**

6. Move the ticket to Verification and tell the user what to look at. Do not mark
   it Done.
