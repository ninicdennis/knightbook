---
title: Projects and documents
description: How Knightbook works with your project folder, your Markdown files and Git.
group: Everyday use
order: 1
appVersion: 0.1.1
---

A Knightbook project is an ordinary folder on your computer, often a code
repository. Your documents stay where they already are. Knightbook adds one folder
of its own, `.projectspace/`, for the board and its records. This guide covers what
that folder holds, how documents get into the workspace, and how to move or share
a project with Git.

## What `.projectspace/` holds

Everything Knightbook knows about a project is in `.projectspace/`, as plain
Markdown files you can open and read:

| Path | What it is |
| --- | --- |
| `project.md` | The project's id and name, which documents are included, folder titles, and the Backlog order |
| `tickets/` | One file per ticket, named by the ticket's id |
| `plans/` | One file per plan |
| `reviews/` | A copy of what you reviewed and when, kept as history |
| `documents/` | Small records that point at included documents, where one is needed |
| `runtime/` | Coordination between the app and AI tools: which ones are connected and recently active |
| `.write-lock` | Held for a moment while something saves, so two writers take turns |

Everything except the last two is your project's content. It travels with the
folder: copy, zip or commit it, and the board, plans and review history come with
it.

`runtime/` and `.write-lock` are not content. They describe what is happening on
this computer right now, are safe to delete while nothing is running, and should not
be committed. If you use Git, add them to your `.gitignore`:

```text
.projectspace/runtime/
.projectspace/.write-lock
```

Do not ignore the whole `.projectspace/` folder. That would leave your tickets,
plans and review history out of the repository, and a fresh clone would open with
an empty board.

The folder keeps the name `.projectspace` from before the product was called
Knightbook. That is deliberate: renaming it would mean changing a folder inside
every existing project, which is your data, not the app's.

## Including documents

Open the **Documents** tab. Under the list, choose **Include**, then **Markdown
files…** or **A folder…**.

Including records a path in `project.md`. It does not copy, move or change the
file, and it does not add anything to the top of it. Include a folder and every
Markdown file inside it appears, including files you add to it later. The list of
included entries shows how many documents each one covers.

**New** creates a Markdown file inside the project and includes it in one step.
You choose the folder, the file name and an optional starting template.

### Folder titles

A folder can have a title, such as "Documentation" for `docs`. Choose the button
beside a folder in the list to name it. The title is saved in `project.md` and
shown in the app and to AI tools. The folder itself is not renamed. If the folder
is later renamed or deleted outside the app, the title is kept and listed as
belonging to a missing folder, until you clear it.

### When an included path stops resolving

If an included file or folder is moved, renamed or deleted outside the app, its
entry says **no longer exists** rather than quietly disappearing. Nothing is
changed for you. Include the new location and remove the old entry, or put the
file back. If a document is still missing, see
[Troubleshooting](../troubleshooting/#documents-or-changes-are-missing).

### Removing versus deleting

The remove button beside an entry takes it out of this workspace. The file stays
exactly where it is on disk, and the confirmation says so. Removing a folder entry
takes out every document in that folder.

Knightbook never deletes your documents. To delete a file, delete it yourself in
your file manager or editor.

## Reading, linking and editing

The Documents view shows Markdown formatted for reading. To change a document,
choose **Edit externally**. The file opens in whatever editor your system uses for
Markdown, and you save it there as usual. Tickets have the same button.

### Links between documents

Write links the way any Markdown editor reads them, relative to the file they are
in: a link to `spec.md` written in `docs/overview.md` opens `docs/spec.md`. A link to an
included document opens it in the app, and a link to a ticket's file opens that
ticket. A link to anything else says why it did not open, for example because the
file is outside the project or not included. Following a link changes nothing, and
**Back** returns you to where you were.

Add a heading to the link, such as `spec.md#open-questions`, to jump to that
section.

### Images

Images inside the project are shown: PNG, JPEG, GIF or WebP, up to 5 MB, written
as a path relative to the document. Images from the internet are never loaded, so
opening a document cannot reach out to another site. SVG images are not shown
either, because they can contain scripts. An image that is not shown leaves a note
saying why.

### Seeing changes made outside the app

Knightbook reads the project again every time its window comes back into focus.
After you save in your editor, switch back and the change is there. If you work
with the window side by side and it never loses focus, use **Refresh from disk**
at the end of the bar along the bottom of the window. If a change still does not
appear, see [Troubleshooting](../troubleshooting/#documents-or-changes-are-missing).

## Saving safely

Every change the app or a connected AI tool makes is checked against the version
it started from. If the file changed in the meantime, in your editor, through Git
or by another tool, the change is refused and the newer version is never
overwritten. For example, if you are editing a ticket in
the app and an AI tool updates it, your edit is not saved. Your text stays on
screen so you can copy what you want to keep, then load the current version and
make the change again. [Troubleshooting](../troubleshooting/#a-change-was-not-saved-or-a-record-cannot-be-read)
covers what each message means.

Your editor and Git do not take part in this check. They write files directly.
The check catches those changes the next time the app or an AI tool saves, but it
cannot stop two of them editing the same file at the same moment.

## Moving and sharing a project with Git

The project is the folder, so it moves with the folder. Copy it, move it or clone
it, and opening it in Knightbook shows the same board. Each copy is opened by its
own path. If you move a folder the app already knew, open it again from its new
location with **Open folder…**. AI tools need access turned on again for the new
location, and an AI client set up for that one folder by its path needs its
configuration updated. If an AI tool still reports the old folder, see
[Troubleshooting](../troubleshooting/#the-wrong-project-appears).

Knightbook does not run Git. Commit, pull, push and switch branches yourself, in
whatever tool you already use.

### Before you pull, switch branches or restore

These replace files underneath the app, so:

1. **Stop anything that is writing.** Finish or pause AI tools that are working in
   the project, and save or close edits open in your editor.
2. **Check what is outstanding.** Look at what is uncommitted in `.projectspace/`
   and in your documents, and commit or set aside what you want to keep.
3. **Then pull, switch or restore.** Switch back to Knightbook, or use **Refresh
   from disk**, and the board shows the new state.

### When Git reports a conflict

If two branches changed the same ticket, Git can leave the file with conflict
markers in it. Knightbook does not guess which side is right. The board says how
many records could not be read and lists them under **Show files**. Those files
are left exactly as they are and cannot be changed from the app until you resolve
the conflict in your editor or Git tool. Keep the parts you mean to keep, finish
the merge, and refresh.

A conflict in `.projectspace/project.md` is different. That file holds the
Backlog order and the included documents for the whole project, so the project
does not open until it is resolved, and Knightbook says **Could not open this
project**. Two branches that both reorder the Backlog or include documents can
cause this. Resolve it the same way, then open the project again
([Troubleshooting](../troubleshooting/#a-change-was-not-saved-or-a-record-cannot-be-read) has the
checks). Do not resolve it by taking one whole side without reading
it: the other side may hold a decision someone recorded.

## What this is not

Knightbook keeps one project's records consistent for the people and AI tools
working in that folder. It is not real-time collaboration: two people on separate
computers see each other's changes only through Git, when they push and pull. It
does not sync your files or back them up. Use Git, or your usual backup, for that.
