import type { ProjectspaceApi } from '../shared/contract.js'

declare global {
  interface Window {
    projectspace: ProjectspaceApi
  }
}
