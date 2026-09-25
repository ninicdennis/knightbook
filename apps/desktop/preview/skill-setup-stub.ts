import type {
  InstalledSkillState,
  SkillSetupApi,
  SkillSetupView,
} from '../src/shared/skill-setup-contract.js'
import { record } from './record.js'

/**
 * One target in each state, so the setup dialog can be reviewed with every
 * badge and every action visible at once. Installing flips a target to matching.
 */

const HOME = String.raw`C:\Users\Denny`
const CHECKOUT = String.raw`C:\Users\Denny\Projects\knightbook-demo`

const states: Record<string, InstalledSkillState> = {
  'claude-personal': 'matching',
  'claude-project': 'absent',
  'codex-personal': 'outdated',
  'codex-project': 'modified',
}

function view(): SkillSetupView {
  return {
    files: ['SKILL.md'],
    skillText: [
      '---',
      'name: projectspace',
      'description: How to work in a Knightbook project through its MCP tools.',
      '---',
      '',
      '# Working in a Knightbook project',
      '',
      'Knightbook is a desktop app where a person and their AI tools share one project.',
    ].join('\n'),
    targets: [
      {
        id: 'claude-personal',
        client: 'Claude Code',
        scope: 'personal',
        path: `${HOME}\\.claude\\skills\\projectspace`,
        state: states['claude-personal']!,
      },
      {
        id: 'claude-project',
        client: 'Claude Code',
        scope: 'project',
        path: `${CHECKOUT}\\.claude\\skills\\projectspace`,
        state: states['claude-project']!,
      },
      {
        id: 'codex-personal',
        client: 'Codex',
        scope: 'personal',
        path: `${HOME}\\.agents\\skills\\projectspace`,
        state: states['codex-personal']!,
      },
      {
        id: 'codex-project',
        client: 'Codex',
        scope: 'project',
        path: `${CHECKOUT}\\.agents\\skills\\projectspace`,
        state: states['codex-project']!,
      },
    ],
  }
}

export const skillSetupStub: SkillSetupApi = {
  skillSetup: async () => ({ ok: true, value: view() }),
  installSkill: async (_rootPath, target, expected) => {
    record('installSkill', { target, expected })
    states[target] = 'matching'
    return { ok: true, value: view() }
  },
  exportSkill: async () => {
    record('exportSkill', null)
    return { ok: true, value: { exportedTo: `${HOME}\\Desktop\\projectspace` } }
  },
}
