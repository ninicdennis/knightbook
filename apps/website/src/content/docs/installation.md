---
title: Installing, updating and removing
description: Install Knightbook on Windows, macOS or Linux, update it by hand, and remove it without losing your projects.
group: Start here
order: 2
appVersion: 0.2.0
---

Knightbook is a desktop app for Windows, macOS and Linux. It is free, and you do not
need an account, Node or any developer tools to run it. This guide covers choosing
the right download, installing it, updating it by hand, and removing it.

**How much of this has been checked.** The installers have not yet been tried on a
clean computer on any of the three systems. The Linux package has been installed,
opened, upgraded and removed in a test machine running Ubuntu 24.04 without a
desktop. Anything else marked **Not yet checked** describes what the installer is
built to do, not something anyone has watched it do. This guide is updated as each
system is checked.

## Choosing a download

Every installer is on the [download page](/download/), and each release lists its
files on GitHub. Pick the one for your computer:

| Your computer | File | Supported versions |
| --- | --- | --- |
| Windows, 64-bit | the Windows installer (`.exe`) | Windows 10 and later |
| Mac with Apple silicon (M1 and later) | the Apple silicon disk image (`.dmg`) | macOS 13 Ventura and later |
| Mac with an Intel processor | the Intel disk image (`.dmg`) | macOS 13 Ventura and later |
| Linux, 64-bit, Debian or Ubuntu | the `.deb` package | current releases still maintained by the distribution |

The file names say the version, the system and the processor:

- `Knightbook-<version>-windows-x64.exe`
- `Knightbook-<version>-macos-arm64.dmg` for Apple silicon
- `Knightbook-<version>-macos-x64.dmg` for Intel
- `Knightbook-<version>-linux-amd64.deb`

To tell which Mac you have, open the Apple menu and choose **About This Mac**. A
line reading **Chip** followed by Apple M-something is Apple silicon; a line reading
**Processor** followed by Intel is an Intel Mac.

There are no builds for Windows or Linux on Arm processors, and no AppImage, rpm or
Flatpak. The supported versions follow the version of Electron that Knightbook is
built on; when an upgrade drops an older system, the release notes say so.

### Checking the download

Each release also has a `SHA256SUMS.txt` file listing a checksum for every
installer. To confirm a file arrived intact, compute its checksum and compare it
with the line for that file:

- Windows (PowerShell): `Get-FileHash .\Knightbook-<version>-windows-x64.exe`
- macOS: `shasum -a 256 Knightbook-<version>-macos-arm64.dmg`
- Linux: `sha256sum Knightbook-<version>-linux-amd64.deb`

If the checksums differ, do not open the file. Download it again, and if it still
differs, [report it](#if-something-looks-wrong).

## Windows

### Installing

Run `Knightbook-<version>-windows-x64.exe`.

The installer is not signed yet, so Windows does not know who published it and may
warn before running it, typically with a blue **Windows protected your PC** screen.
**Not yet checked:** the exact warning has not been recorded. If the checksum
matches and the warning only says the publisher is unknown, choose **More info**,
then **Run anyway**. If it says anything else, such as that the file contains a
virus, stop and [report it](#if-something-looks-wrong).

**Not yet checked:** the installer asks no questions and needs no administrator
rights. It installs Knightbook for your Windows account only, adds it to the Start
menu and the desktop, and opens it when it finishes.

### Where it goes

**Not yet checked:**

- The app goes in `AppData\Local\Programs\Knightbook` in your user folder.
- Its settings go in `AppData\Roaming\Knightbook`.
- The MCP configuration that Knightbook copies for your AI tool names the
  `resources\mcp\node.exe` file inside the app's folder.

### First launch

**Not yet checked** on Windows: Knightbook opens to **Choose a project folder**. Choose any folder you work in, such
as a code repository. If it has no Knightbook board yet, choose **Set up this
folder**. That adds one folder, `.projectspace/`, and leaves your files as they are.
[Projects and documents](../projects-and-documents/) explains what it holds.

## macOS

### Installing

**Not yet checked:** open the disk image for your Mac, drag **Knightbook** into the
**Applications** folder, then eject the disk image.

The app is not signed with an Apple developer certificate or notarized by Apple yet,
so macOS will not open it straight away the first time. **Not yet checked:** the
message macOS shows, and what it takes to get past it, have not been recorded on
either kind of Mac. Apple's usual route for an app it cannot check is to try
opening it once, then go to **System Settings**, **Privacy & Security**, and choose
**Open Anyway** for that app. Do not turn off Gatekeeper or other protections for
the whole Mac to run Knightbook. If macOS says the app is damaged, or offers no way
to open it, [report it](#if-something-looks-wrong).

The Intel build has not been opened on an Intel Mac yet.

### Where it goes

**Not yet checked:**

- The app is `/Applications/Knightbook.app`.
- Its settings go in `~/Library/Application Support/Knightbook`.
- The MCP configuration names `Contents/Resources/mcp/node` inside the app.

### First launch

**Not yet checked** on a Mac: the same as on Windows, **Choose a project folder**,
then **Set up this folder** if it has no board yet.

## Linux

### Installing

Install the package with `apt`, which also installs the system libraries Knightbook
needs:

```sh
sudo apt install ./Knightbook-<version>-linux-amd64.deb
```

Keep the `./`, which tells `apt` you mean a file rather than a package by that name.
Installing with `dpkg -i` instead stops with the package half installed when a
library is missing, so use `apt`.

The package is not signed. In the test, `apt` installed it without any warning about
the publisher, so the checksum is your check that the file is the one published.

### Where it goes

- The app goes in `/opt/Knightbook`, and the package is called `knightbook`.
- It adds the command `knightbook`, and a launcher named Knightbook, in the
  Development category, for your applications menu. **Not yet checked:** how it shows in a real desktop's menu.
- Its settings go in `~/.config/Knightbook`.
- The MCP configuration names `/opt/Knightbook/resources/mcp/node`. That path stays
  the same when you update, so the configuration you copied keeps working.

### First launch

Open Knightbook from your applications menu. In the test machine the app started
on a virtual display, and with the app closed its MCP server ran with no Node
installed and created and listed tickets. **Not yet checked:** the window itself,
which should open to **Choose a project folder** as on the other systems, a real
desktop such as GNOME or KDE, and a real AI tool connecting.

## Updating

Knightbook has no updater yet. It does not check for new versions or tell you about
them, and nothing is downloaded in the background. You update by installing the new
version over the old one. To hear about new releases, watch the
[releases on GitHub](https://github.com/ninicdennis/knightbook/releases), or check
the [releases page](/releases/).

1. **Find the version you have.** On Windows, look for Knightbook under **Settings**,
   **Apps**, **Installed apps** (not yet checked). On macOS, open the **Knightbook**
   menu and choose **About Knightbook** (not yet checked). On Linux, run
   `dpkg -s knightbook` and read the `Version` line.
2. **Back up your projects.** Your projects are your own folders, and updating does
   not touch them, but a copy costs little. If a project is in Git, commit it,
   including `.projectspace/`. Otherwise copy the folder somewhere safe.
3. **Quit Knightbook, and any AI tool connected to it.** Then nothing is running
   from the installed files while they are replaced.
4. **Install the new version** the same way you installed the first one. On
   Windows, run the new installer. On macOS, drag the new app into
   **Applications** and choose **Replace**. On Linux, run the same `apt install`
   command with the new file. In the Linux test, `apt` replaced the old version in
   place, and the settings and the copied MCP configuration kept working. **Not yet
   checked** on Windows and macOS.
5. **Reconnect your AI tool.** The app stays in the same place, so the configuration
   you copied before should still be right. Restart the AI tool so it starts the
   new version's server: one already running keeps the old one. If Knightbook's
   MCP status, at the bottom of the window, reports a problem, copy the
   configuration again from there and replace the one in your AI tool.
6. **Open your project** and check that the board and documents look as you left
   them.

Going back to an older version, by installing it over a newer one, has not been
checked on any system.

## Removing Knightbook

### Removing the app

- **Windows:** **Settings**, **Apps**, **Installed apps**, then Knightbook and
  **Uninstall**. **Not yet checked:** this removes the app's folder and leaves its
  settings.
- **macOS:** quit Knightbook and drag it from **Applications** to the Trash.
  **Not yet checked:** its settings stay.
- **Linux:** `sudo apt remove knightbook`. In the Linux test this removed
  `/opt/Knightbook` and the applications menu entry. `sudo apt purge knightbook`
  removed nothing more: the settings in your home folder stayed in both cases.

### What stays: the app's settings

Removing the app leaves its settings folder (`AppData\Roaming\Knightbook`,
`~/Library/Application Support/Knightbook` or `~/.config/Knightbook`). It holds
your recent projects, the colour scheme, the window's size and place, which projects
AI tools may reach, and the browser caches the app uses. It holds no project
content. Delete the folder yourself if you want it gone.

Two things outside Knightbook also stay, because they belong to your AI tools and
the uninstaller does not know about them (**not yet checked** on any system):

- the Knightbook entry in each AI tool's MCP configuration, which now names a
  program that is gone. Remove it in that tool.
- the workflow skill, if you installed it with **Set up your AI tool**, in folders
  such as `~/.claude/skills/projectspace` or a project's `.claude/skills/`. Delete
  them if you no longer want them.

### What stays: your projects

Removing Knightbook does not touch your project folders (seen on Linux; **not yet
checked** on Windows and macOS). Each keeps its
`.projectspace/` folder with its tickets, plans and review history, as plain
Markdown. In the Linux test, a project created before removing was still there,
with its ticket, afterwards. If you want a project's board gone too,
delete its `.projectspace/` folder yourself.

## If something looks wrong

If the installer will not run, start with
[Troubleshooting](../troubleshooting/#the-installer-will-not-run). Otherwise, or if
you see a warning this guide does not describe, report it with the
[bug report form](https://github.com/ninicdennis/knightbook/issues/new?template=bug_report.yml).
Say which system and version you are on, which file you downloaded, and the exact
words of any message, or a screenshot of it. Issues are public, so read
[what to include and what never to post](../troubleshooting/#asking-for-help) first.
