---
title: Troubleshooting and support
description: What to check when installing, connecting or opening a project goes wrong, and how to ask for help.
group: Troubleshooting
order: 1
appVersion: 0.1.1
---

Each section below starts from what you see, then gives the same four things:
what to check first, what you should see when it is working, the next step that
cannot lose any of your work, and when to stop and ask for help.

## Before you change anything

Most problems here are about what the app or an AI tool can see, not about your
files. Knightbook does not delete documents, does not overwrite a record that
changed since it was read, and leaves a file it cannot read exactly as it is. So
the safe first move is almost always to look, not to repair.

If you are about to edit files in `.projectspace/` by hand, restore from a backup,
or reinstall, first make a copy of the project folder or commit it with Git. Then
whatever you try can be undone.

## The installer will not run

**First checks**

- Match the file to your computer. Each release has one file per system, and
  there is no Windows build for Arm processors:
  - Windows on an Intel or AMD processor: `Knightbook-<version>-windows-x64.exe`
  - A Mac with Apple silicon: `Knightbook-<version>-macos-arm64.dmg`
  - An Intel Mac: `Knightbook-<version>-macos-x64.dmg`
  - Debian or Ubuntu on an Intel or AMD processor:
    `Knightbook-<version>-linux-amd64.deb`
- Check the download is complete. The [download page](/download/) lists each file's
  size and SHA-256 checksum, with the command that prints it on your system. A
  different checksum means the file is incomplete or not the one published.
- Check the signing state. The download page says whether each file is
  code-signed. Your system may warn before opening a file that is not, and the
  warning names no publisher.
- Check the [release notes](/releases/) for your version. A release with a known
  problem says so there, and a withdrawn release says which version to use
  instead.

**What you should see:** the checksum you print matches the one on the download
page exactly, and the release you downloaded is not marked as withdrawn.

**Next safe step:** if the checksum differs, delete the file and download it
again from the [download page](/download/). If it matches and the release is not
withdrawn, the file is the one that was published. This guide does not give steps
for turning off your system's protection; whether to open an unsigned file is
your decision.

**When to ask for help:** the checksum still differs after a fresh download, your
system shows an error rather than a warning, the warning names a publisher other
than Knightbook, or the installer starts and then fails. Say which file you used
and what the message said.

## MCP runtime missing

The status in the bar along the bottom of the window reads **MCP runtime
missing**. Its details say the bundled server this app hands your AI client is not
where it should be, so the copied configuration would not start anything.

**First checks**

- Make sure you are running the installed app, not a copy of its files moved
  somewhere else or a build from the source code. The server and the Node runtime
  it needs ship beside the app, in its `mcp` folder.
- Click the status and read the **Bundled runtime** line in its details. It says
  what was looked for.
- Check the [release notes](/releases/) for your version in case this is a known
  problem with that build.

**What you should see:** with the runtime in place, the status reads **MCP not
connected** until an AI client starts the server, and then **MCP available** or
**MCP connected**.

**Next safe step:** install the same version again over the top. Reinstalling
replaces the app's own files only; your projects are separate folders and are not
touched. If you are working from a source checkout, run a full build instead.

**When to ask for help:** the runtime is still missing after reinstalling, or the
release notes describe repair steps that do not work.

## MCP not connected

The status reads **MCP not connected**: no running server was observed for this
project. That is not the same as one being stopped. The app cannot start or stop
the server; your AI client starts it.

**First checks**

- Click the status and look for **Allow AI access through MCP**. It must be on for
  this project. Opening a project never turns it on by itself.
- Check that your AI client has the configuration from **Copy MCP configuration**,
  added as the client's own documentation describes, and that you started or
  restarted the client afterwards.
- Look at your AI client's own list of MCP servers and its error output. If it
  reports that the server failed to start, the path in its configuration is
  probably out of date: a configuration saved when the app was called
  Projectspace, or before you reinstalled somewhere else, names a folder the
  current install does not use.
- Read the other status labels for what they mean:
  - **MCP server running**: a server is up but no client has connected to it yet.
    If your client is starting up, this usually resolves on its own.
  - **MCP not allowed here**: a client is connected through the shared
    configuration, but this project is not allowed, so it cannot reach it.
  - **MCP access unknown**: the list of allowed projects could not be read, so
    the shared connection reaches no project. The file was left untouched.
  - **MCP status unknown**: the project folder could not be read, so nothing could
    be observed. This says nothing about whether a server is running.

**What you should see:** **MCP available**, which means a client is connected
through the shared configuration and this project is allowed, or **MCP connected**
for an older setup made for this one folder. Neither proves the client is working
in this project; ask it to name the project it sees (see
[the wrong project appears](#the-wrong-project-appears)).

**Next safe step:** use **Copy MCP configuration** again, replace the old entry in
your client, and restart the client. The name you gave the entry in your client is
yours and does not need to change. For **MCP not allowed here**, turn on **Allow AI
access through MCP** for the project. For **MCP access unknown**, the app tells you
to repair the list or remove it and allow your projects again; before removing it,
copy it somewhere else so nothing is lost.

**When to ask for help:** the client still cannot start the server with a freshly
copied configuration, or its error output says something this guide does not
explain. Include only the lines that show the error, with paths and names replaced.

## The wrong project appears

An AI tool reports a different name, different tickets, or changes that never show
up in the window you have open.

**First checks**

- Ask the AI tool to tell you the project name and checkout path it is using,
  without changing anything. On the shared connection it lists the allowed
  projects with `projects_list`, and every answer names the project it acted on.
- Compare that path with the one under **Open now** in the app's project list.
  **Copy path** copies it exactly.
- Clones and worktrees of one project share its name and id. Only the path tells
  them apart, so a clone you allowed months ago can look just like the folder in
  front of you.
- For an older setup made for one folder, the path is the one after `--root` in
  your client's configuration.

**What you should see:** the path the AI tool reports is exactly the path of the
folder open in the app.

**Next safe step:** tell the AI tool which `checkout_id` or path to use, or turn
off **Allow AI access through MCP** in the copy you do not mean and turn it on in
the one you do. Do not copy `.projectspace/` from one clone into another to make
them agree; use Git to bring the work across. If the AI tool reports that a
project was not found, has moved, or now holds a different project, that is the
check working as intended. It never switches to another copy on its own. Allow the
folder again at its new location.

**When to ask for help:** the AI tool keeps reporting a path you have turned off,
or one you never allowed.

## Documents or changes are missing

A document is not in the list, or a change you made in your editor, through Git or
by an AI tool does not appear.

**First checks**

- Check that the same folder is open. Compare the path under **Open now** with the
  folder you edited.
- In the **Documents** tab, look at the included entries. An entry that says **no
  longer exists** points at a file or folder that was moved, renamed or deleted
  outside the app.
- Check the file is still there in your file manager, and that it is a Markdown
  file inside an included folder.
- Switch away from the window and back, or use the refresh button at the end of
  the bar along the bottom of the window. Its tooltip reads **Reload from the
  project files.** The app reads the project again each
  time its window comes back into focus, but not while it keeps focus.
- If you switched Git branches or pulled, the files on disk now match that branch.

**What you should see:** after a refresh, the document is listed and opens, and the
change is there.

**Next safe step:** include the file's new location and remove the old entry, or
put the file back. Removing an entry never deletes the file. See
[Projects and documents](../projects-and-documents/#including-documents).

**When to ask for help:** the file is in an included folder of the open project
and still does not appear after a refresh.

## A change was not saved, or a record cannot be read

The app refused a change because the record changed first, or it cannot read a
ticket, a plan or the project itself.

**First checks**

- A change refused because something else saved first reads **That ticket changed
  somewhere else, so your move was not applied.** When you were editing a ticket,
  the app says **This ticket changed after you started editing**, and your text
  stays on screen. An AI tool gets `revision_conflict`: the record changed since it
  was read.
- A file the app cannot use appears above the board as **1 record could not be
  read, so it is not on the board**, or the number of records. **Show files**
  lists each file and the reason, such as a file that contains unresolved merge
  conflict markers.
- When `.projectspace/project.md` itself cannot be read, the app says **Could not
  open this project**, with the reason and **Nothing was changed. Your files are
  exactly as they were.**

**What you should see:** after you reapply the change to the current version, it
saves. After the file is fixed and you refresh, the record is back on the board.

**Next safe step:** keep both versions. For a refused edit, copy your text
somewhere first, then choose **Discard my edit and load the current version**,
read what changed, and make your change again. Ask an AI tool to re-read the record and reapply its change, not to
force it. For an unreadable file, open it in your editor or Git tool and resolve
it there: after a merge conflict, keep the parts you mean to keep from each side
and finish the merge. Do not take one whole side of `project.md` without reading
it, because the other side may hold a decision someone recorded. Then refresh. See
[Projects and documents](../projects-and-documents/#when-git-reports-a-conflict).

**When to ask for help:** a file with no conflict markers, written only by the app
or an AI tool through Knightbook, cannot be read. Say which kind of record it is
and the reason under **Show files**, not the file's content.

## Done or review looks wrong

A ticket is in Done when you did not accept it, or its review badge is not what
you expected.

**First checks**

- Read the label on the card. **Accepted by you** means you accepted it in the
  app. **Recorded by AI** means you told an AI tool it was complete and it
  recorded your words; its tooltip quotes them. **Unattributed** means the ticket
  is in Done with no recorded decision, usually because its file was edited
  outside the app.
- A ticket that was accepted and then moved out of Done keeps the earlier
  acceptance under **Reopened after acceptance**. That is history, not acceptance
  now.
- For review, **Unreviewed** means no one has confirmed the content yet, and
  **Changed since review** means the text changed after someone did. A ticket with
  no review badge was reviewed and has not changed since. Moving a ticket between
  columns does not change its review state. No AI tool can mark anything reviewed.
- If you use Git, the history of the ticket's file under `.projectspace/tickets/`
  shows who changed it and when.

**What you should see:** every ticket in Done says **Accepted by you** or
**Recorded by AI**, and you recognise each decision.

**Next safe step:** do not take Done as acceptance unless the record says who
decided it. To undo it, move the ticket out of Done and accept it again yourself
when you are ready. See
[Tickets, verification and review](../tickets-and-verification/#deciding-done).

**When to ask for help:** a ticket reads **Accepted by you** for a decision you
did not make in the app, or **Recorded by AI** when you never told an AI tool it
was complete.

## Something changed after an update

The app or an AI tool behaves differently after you installed a new version.

**First checks**

- Read the [release notes](/releases/) for every version between the one you had
  and the one you have now. They list what changed in each release.
- Restart your AI client. A client keeps running the server it started with until
  it restarts, so it can still be talking to the old version.
- If the client cannot start the server at all, use **Copy MCP configuration** and
  compare it with what your client has saved. If the path differs, replace it.
- A record written by a newer version than the one you are running cannot be read
  by the older one. **Show files**, or **Could not open this project** for the
  project itself, then says the record uses a newer `schema_version` than this
  build supports, and that the file was left unchanged.

**What you should see:** after restarting the client, the project opens, the board
shows its tickets, and the status reads **MCP available** or **MCP connected**.

**Next safe step:** keep the newest version installed on every computer that opens
the project. Do not go back to an older version after a release says it changes
the format of project records, and do not edit `schema_version` by hand. Before
updating, commit the project or copy its folder.

**When to ask for help:** the release notes do not explain the change, or the
project will not open after the update.

## Asking for help

Report a problem on GitHub with the
[bug report form](https://github.com/ninicdennis/knightbook/issues/new?template=bug_report.yml).
Knightbook's maintainer answers there. For an idea or a request, use the
[idea form](https://github.com/ninicdennis/knightbook/issues/new?template=feature_request.yml).
Everything you write in an issue is public.

**A security problem is never reported in a public issue.** Use
[private vulnerability reporting](https://github.com/ninicdennis/knightbook/security/advisories/new)
instead.

### What to include

- **The Knightbook version.** The app does not show it yet. It is in the
  installer's file name, such as `Knightbook-0.1.1-windows-x64.exe`.
- **Your operating system, its version, and the processor**, such as Windows 11
  x64, macOS 15 on Apple silicon, or Ubuntu 24.04 x64.
- **The AI client and its version**, if one is involved.
- **Steps to reproduce**, from opening the app to the problem.
- **What you expected and what happened instead**, with the section of this guide
  you tried.
- **The error, redacted.** Copy only the lines that show it, and replace names,
  paths and secrets with placeholders such as `<project>`, `<user>` or `<token>`.

### What never to post

- **A whole private project**, its `.projectspace/` folder, or your documents. If
  a file's shape matters, describe it, or make a small example project that shows
  the same problem.
- **Credentials**: API keys, tokens, passwords, or a client configuration file
  that contains any of them.
- **Unredacted client logs.** AI client logs often hold your prompts, file
  contents and keys. Post only the lines that show the error, after replacing what
  identifies you or your work.
