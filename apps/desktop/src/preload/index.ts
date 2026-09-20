import { contextBridge, ipcRenderer } from 'electron'
import type { ProjectspaceApi } from '../shared/contract.js'

/**
 * The only bridge between the renderer and the host. Each method is a named
 * operation, so the renderer cannot reach the filesystem, the shell, or an
 * arbitrary IPC channel.
 */
const api: ProjectspaceApi = {
  rememberedProjects: () => ipcRenderer.invoke('app:rememberedProjects'),
  forgetProject: (path) => ipcRenderer.invoke('app:forgetProject', path),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  inspectFolder: (path) => ipcRenderer.invoke('project:inspectFolder', path),
  setUpFolder: (path, name, include) => ipcRenderer.invoke('project:setUp', path, name, include),
  readProject: (rootPath) => ipcRenderer.invoke('project:read', rootPath),
  setTicketStatus: (rootPath, id, status, revision) =>
    ipcRenderer.invoke('ticket:setStatus', rootPath, id, status, revision),
  completeTicket: (rootPath, id, revision) =>
    ipcRenderer.invoke('ticket:complete', rootPath, id, revision),
  recordTicketReview: (rootPath, id, note) =>
    ipcRenderer.invoke('ticket:review', rootPath, id, note),
  readTicket: (rootPath, id) => ipcRenderer.invoke('ticket:read', rootPath, id),
  mcpLaunchCommand: (rootPath) => ipcRenderer.invoke('mcp:launchCommand', rootPath),
  mcpStatus: (rootPath) => ipcRenderer.invoke('mcp:status', rootPath),

  listDocuments: (rootPath) => ipcRenderer.invoke('documents:list', rootPath),
  readDocument: (rootPath, path) => ipcRenderer.invoke('document:read', rootPath, path),
  reviewDocument: (rootPath, path) => ipcRenderer.invoke('document:review', rootPath, path),
  openDocumentExternally: (rootPath, path) =>
    ipcRenderer.invoke('document:openExternally', rootPath, path),
  openExternalLink: (url) => ipcRenderer.invoke('link:openExternal', url),
}

contextBridge.exposeInMainWorld('projectspace', api)
