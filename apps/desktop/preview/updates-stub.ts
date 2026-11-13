import type { UpdatesApi, UpdateView } from '../src/shared/updates-contract.js'
import { record } from './record.js'

/**
 * Update states for layout review. `?update=available` (or `downloading`,
 * `ready`, `in-use`, `failed`, `notify`) shows that state's notice; without it the
 * stub reports a build that is up to date.
 */

const RELEASE = {
  version: '0.4.0',
  notesUrl: 'https://github.com/ninicdennis/knightbook/releases/tag/v0.4.0',
  installable: true,
}

function stubView(): UpdateView {
  const asked = new URLSearchParams(window.location.search).get('update')
  const base = { currentVersion: '0.3.1', mode: 'install' as const }
  switch (asked) {
    case 'available':
      return { ...base, status: { phase: 'available', release: RELEASE } }
    case 'notify':
      return { ...base, mode: 'notify', status: { phase: 'available', release: RELEASE } }
    case 'downloading':
      return { ...base, status: { phase: 'downloading', release: RELEASE, percent: 42 } }
    case 'ready':
      return { ...base, status: { phase: 'ready', release: RELEASE } }
    case 'in-use':
      return {
        ...base,
        status: { phase: 'in-use', release: RELEASE, heldFiles: ['node.exe'] },
      }
    case 'failed':
      return {
        ...base,
        status: {
          phase: 'failed',
          stage: 'download',
          message: 'The download failed: net::ERR_INTERNET_DISCONNECTED. Nothing was installed.',
          release: RELEASE,
        },
      }
    default:
      return { ...base, status: { phase: 'up-to-date', checkedAt: new Date().toISOString() } }
  }
}

export const updatesStub: UpdatesApi = {
  updateView: async () => stubView(),
  checkForUpdates: async () => {
    record('checkForUpdates')
    return stubView()
  },
  downloadUpdate: async () => {
    record('downloadUpdate')
    return stubView()
  },
  installUpdate: async () => {
    record('installUpdate')
    return stubView()
  },
  onUpdateView: () => () => undefined,
}
