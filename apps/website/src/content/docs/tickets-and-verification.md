---
title: Tickets, verification and review
description: Ticket states, dependencies, AI handoffs, your completion decision and content review.
group: Everyday use
order: 2
appVersion: 0.1.1
---

A ticket says what work is wanted and where it stands. This guide follows two small
tickets from start to finish, so you can see what each step records and what it
does not.

## The four columns

The board has four columns, and they describe the state of the work:

- **Backlog**: wanted, not started. Every new ticket starts here.
- **In progress**: someone, you or an AI tool, is working on it.
- **Verification**: the work is finished and waiting for you to check it.
- **Done**: you accepted it.

Three other things are tracked separately and never change the column: whether
another ticket is holding this one back, whether you have reviewed its text, and
whether it failed verification. The rest of this guide keeps them apart.

## The example

Say your project needs a CSV export, and a page in your documentation that
explains it. That is two tickets, because each has its own result to check:

1. **Add a CSV export**
2. **Document the CSV export**, which depends on the first

Create a ticket with the **+** at the top of the Backlog column. The new ticket
starts with three sections you can change or remove: **Intended outcome**, what
will be true when it is done; **Acceptance criteria**, statements you can check
one by one; and **Notes**. An AI tool connected to the project can create tickets
too, and they arrive in Backlog the same way.

## Dependencies

Open **Document the CSV export**, choose **Edit ticket**, then **Prerequisites and
documents**, and add **Add a CSV export** as a prerequisite.

While the export is still in Backlog or In progress, the documentation ticket shows
**Waiting on 1**. Once the export reaches Verification or Done, the badge changes
to **Unlocked**.

**Unlocked does not mean accepted.** A prerequisite counts as ready as soon as it
reaches Verification, before you have checked it. That lets the next piece of work
begin while you review the first, but it also means the documentation can be built
on work you may still send back. The badge's tooltip says so.

**Next up** marks the first ticket in Backlog whose prerequisites are all ready.
Backlog order is yours: use **Move to top**, **Move up** and **Move down** in a
card's menu. An AI tool asked for the next ticket gets this same one, and the
tool only proposes it. It does not start work until you ask.

## Starting work

Move **Add a CSV export** to In progress, by dragging the card or with **Move to**
in its menu. If an AI tool is doing the work, ask it to start. The workflow
Knightbook ships for AI tools says to begin only when asked.

When a ticket cannot move forward, record why with **Edit ticket**, then **Add a
blocker**. The card shows **Blocked**, and the reason is on the ticket for whoever
picks it up next.

## The handoff

When the export works, the ticket moves to Verification with a handoff note at
the end of its body. An AI tool following the Knightbook workflow writes it, and
you can write one yourself the same way. It has four parts:

```markdown
## Handoff
**What changed:** Projects export to CSV from the File menu, one row per ticket: title, status, type and the date it last changed.
**How it was checked:** Unit tests for column order and for quoting commas and line breaks. Exported a 40-ticket project and opened it in a spreadsheet.
**Not verified:** Projects over 1,000 tickets. Locales where a comma is not the list separator.
**For you to check:** Export one of your own projects and confirm the columns are the ones you want.
```

**Not verified** matters most. It says what nobody has checked yet, so finished
work does not read as tested work. Read the note before you decide anything, then
check the work itself.

## Deciding Done

Only you decide that work is done. When the export is right, accept it in one of
three ways:

- **Accept as done** at the foot of the ticket.
- **Accept as done** in the card's menu.
- Drag the card into the Done column.

Each one asks **Accept this as done?** first, so a slipped drag cannot decide
anything. Only a ticket in Verification can be accepted. Done is not in the
**Move to** list.

You can also tell an AI tool "the CSV export is done", and it can record that for
you. The board keeps the two apart, so a decision passed on by an AI never reads as
a click of your own:

| On the card | What it means |
| --- | --- |
| **Accepted by you** | You accepted it in the app |
| **Recorded by AI** | You told an AI tool it was complete, and it recorded what you said. Its tooltip quotes the AI's summary of your words |
| **Unattributed** | The ticket is in Done with no recorded decision, usually because its file was edited outside the app. Nothing shows who accepted it |

If a card's label is not what you expect, see
[Troubleshooting](../troubleshooting/#done-or-review-looks-wrong).

An AI tool cannot set Done any other way. Passing tests, its own review, or the
ticket reaching Verification are not your decision, and the tools refuse to treat
them as one.

To reopen accepted work, move it out of Done. The earlier acceptance is kept under
**Reopened after acceptance** on the ticket, as history. The ticket is not accepted
again until you accept it again.

## When it does not pass

Suppose the export puts dates in a format your spreadsheet cannot read. Choose
**Did not pass…** at the foot of the ticket, or **Did not pass verification…** in
the card's menu, write what you found, and choose **Record the issue**.

Then:

- The export ticket shows **Failed verification** with your reason.
- **Document the CSV export**, and anything further down the chain, shows
  **Affected by a failure**, and it is no longer suggested as Next up.
- **Nothing is moved or reset.** Both tickets stay where they were. You decide what
  to rework: move the export back to In progress, rewrite the ticket, or leave it.

You can also tell an AI tool it did not pass, and it records your reason the same
way. The ticket says the decision was yours and the AI only recorded it.

When the problem is settled, choose **Resolve the verification issue**. That clears
the flag from every affected ticket at once. Fixing the code does not resolve the
issue by itself: only you do, in the app, or by telling an AI tool it is settled.

## Review is separate from Done

Review answers a different question: has a person read this text? Accepting work
says the work is right. Reviewing a ticket says you have read what the ticket
says. Each card shows one of three states:

- **Unreviewed**: no one has confirmed the content yet.
- **Changed since review**: someone did, but the text has changed since. Its
  tooltip summarises the change, and the ticket shows the changes line by line
  under **Changes since review**.
- No badge: reviewed, and unchanged since. The ticket itself shows **Reviewed by
  you**.

Choose **Mark content reviewed**, or **Mark reviewed again**, on the ticket or in
the card's menu. Review never blocks work: an unreviewed ticket can still move all
the way to Done. A change to the ticket's wording returns it to Changed since
review. Moving it between columns does not. Knightbook can tell you the text
changed, but not whether the meaning did. A review state you do not expect is
covered in [Troubleshooting](../troubleshooting/#done-or-review-looks-wrong).

AI tools can report the review state but cannot record a review. No tool for it
exists.

## Plans

A plan groups tickets into ordered phases, such as the steps of a launch. Open the
**Plans** tab and choose **New plan**, then **Add phase**, and attach existing
tickets to each phase. A ticket's own view lists the plans it belongs to.

A plan's progress is worked out from its tickets every time you look. Verification
is counted apart from Done, a missing ticket is never counted as done, and a phase
with no tickets reads as empty, not finished. Linking a ticket to a plan changes
nothing on the ticket.

## Archiving

Archiving takes tickets off the board without losing them. Choose **Archive** in a
card's menu, or **Archive all in this column…** from the column header. Archived
tickets are listed under the **Archive** tab, where **Restore** puts each one back.

An archived ticket keeps its column, its history and any acceptance. Archiving
does not finish work or accept it, and restoring does not reopen it. An archived
ticket still in Backlog does not count as ready for the tickets that depend on it.

## What this does and does not protect

Tickets are Markdown files in your project folder, under `.projectspace/tickets/`.
You or any tool with access to the folder can edit them, so none of this is a
lock. What Knightbook does is make the record visible. It shows who recorded each
decision, flags Done that nobody recorded as **Unattributed**, and refuses a change
based on a ticket that was edited since it was read, instead of overwriting the
newer version.
