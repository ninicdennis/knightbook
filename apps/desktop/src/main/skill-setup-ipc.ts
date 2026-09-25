import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { openProject } from '@knightbook/core'
import type {
  SkillSetupView,
  SkillTargetId,
  SkillTargetView,
} from '../shared/skill-setup-contract.js'
import { readAppState, recordInstalledSkill } from './app-state.js'
import { guard } from './guard.js'
import {
  exportSkill,
  inspectInstalledSkill,
  installSkill,
  readSkillFolder,
  skillTargets,
  type SkillFiles,
  type SkillTarget,
} from './skill-install.js'

/**
 * Installing and exporting the workflow skill that ships with the app. The
 * renderer names a target by id; every path is worked out here, so it can only
 * ever write to the four documented folders or to one the user picked.
 */

/**
 * Packaged, it sits beside the MCP runtime in `extraResources`. In development it
 * is read straight from the repository, which is also the one source packaging
 * copies from, so there is no second copy to drift.
 */
function bundledSkillDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'skills', 'projectspace')
    : join(app.getAppPath(), '..', '..', 'skills', 'projectspace')
}

async function bundledSkill(): Promise<SkillFiles> {
  const files = await readSkillFolder(bundledSkillDir())
  if (files === null || !files.has('SKILL.md')) {
    throw new Error(
      `The workflow skill that should ship with the app is missing from ${bundledSkillDir()}. Reinstalling Knightbook should restore it.`,
    )
  }
  return files
}

async function targetsFor(rootPath: unknown): Promise<SkillTarget[]> {
  if (typeof rootPath !== 'string') throw new Error('A project path is required.')
  const project = await openProject(rootPath)
  return skillTargets(homedir(), project.root.path)
}

async function describeSetup(targets: SkillTarget[], bundled: SkillFiles): Promise<SkillSetupView> {
  const { installedSkills } = await readAppState()
  const views: SkillTargetView[] = await Promise.all(
    targets.map(async (target) => ({
      id: target.id,
      client: target.client,
      scope: target.scope,
      path: target.dir,
      state: await inspectInstalledSkill(target.dir, bundled, installedSkills[target.dir] ?? null),
    })),
  )
  return {
    files: [...bundled.keys()].sort(),
    skillText: bundled.get('SKILL.md')!.toString('utf8'),
    targets: views,
  }
}

export function registerSkillSetupHandlers(): void {
  ipcMain.handle(
    'skill:setup',
    async (_event, rootPath: unknown) =>
      await guard<SkillSetupView>(async () =>
        describeSetup(await targetsFor(rootPath), await bundledSkill()),
      ),
  )

  ipcMain.handle(
    'skill:install',
    async (_event, rootPath: unknown, id: unknown, expected: unknown) =>
      await guard<SkillSetupView>(async () => {
        if (expected !== 'absent' && expected !== 'outdated') {
          throw new Error('Only a missing or outdated skill can be installed over.')
        }
        const targets = await targetsFor(rootPath)
        const target = targets.find((candidate) => candidate.id === (id as SkillTargetId))
        if (!target) throw new Error('That is not a place Knightbook installs the skill.')

        const bundled = await bundledSkill()
        const recorded = (await readAppState()).installedSkills[target.dir] ?? null
        const fingerprint = await installSkill(target.dir, bundled, { expected, recorded })
        await recordInstalledSkill(target.dir, fingerprint)
        return await describeSetup(targets, bundled)
      }),
  )

  ipcMain.handle(
    'skill:export',
    async (event) =>
      await guard<{ exportedTo: string } | null>(async () => {
        const bundled = await bundledSkill()
        const owner = BrowserWindow.fromWebContents(event.sender)
        const options = {
          title: 'Export the workflow skill',
          buttonLabel: 'Export here',
          properties: ['openDirectory', 'createDirectory'] as Array<
            'openDirectory' | 'createDirectory'
          >,
        }
        const chosen = owner
          ? await dialog.showOpenDialog(owner, options)
          : await dialog.showOpenDialog(options)
        if (chosen.canceled || !chosen.filePaths[0]) return null
        return { exportedTo: await exportSkill(chosen.filePaths[0], bundled) }
      }),
  )
}
