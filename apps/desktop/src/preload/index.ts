import { contextBridge, ipcRenderer } from 'electron'
import type { KnightbookApi } from '../shared/contract.js'

/**
 * The only bridge between the renderer and the host. Each method is a named
 * operation, so the renderer cannot reach the filesystem, the shell, or an
 * arbitrary IPC channel.
 */
const api: KnightbookApi = {
  rememberedProjects: () => ipcRenderer.invoke('app:rememberedProjects'),
  forgetProject: (path) => ipcRenderer.invoke('app:forgetProject', path),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  inspectFolder: (path) => ipcRenderer.invoke('project:inspectFolder', path),
  setUpFolder: (path, name, include) => ipcRenderer.invoke('project:setUp', path, name, include),
  readProject: (rootPath) => ipcRenderer.invoke('project:read', rootPath),
  setTicketStatus: (rootPath, id, status, revision) =>
    ipcRenderer.invoke('ticket:setStatus', rootPath, id, status, revision),
  setTicketType: (rootPath, id, type, revision) =>
    ipcRenderer.invoke('ticket:setType', rootPath, id, type, revision),
  completeTicket: (rootPath, id, revision) =>
    ipcRenderer.invoke('ticket:complete', rootPath, id, revision),
  recordVerificationIssue: (rootPath, id, revision, reason) =>
    ipcRenderer.invoke('ticket:recordVerificationIssue', rootPath, id, revision, reason),
  resolveVerificationIssue: (rootPath, id, revision) =>
    ipcRenderer.invoke('ticket:resolveVerificationIssue', rootPath, id, revision),
  recordTicketReview: (rootPath, id, note) =>
    ipcRenderer.invoke('ticket:review', rootPath, id, note),
  readTicket: (rootPath, id) => ipcRenderer.invoke('ticket:read', rootPath, id),
  searchTickets: (rootPath, query) => ipcRenderer.invoke('ticket:search', rootPath, query),
  reorderBacklog: (rootPath, ticketIds) =>
    ipcRenderer.invoke('ticket:reorderBacklog', rootPath, ticketIds),
  mcpLaunchCommand: (rootPath) => ipcRenderer.invoke('mcp:launchCommand', rootPath),
  mcpStatus: (rootPath) => ipcRenderer.invoke('mcp:status', rootPath),
  readSettings: () => ipcRenderer.invoke('app:readSettings'),
  saveSettings: (patch) => ipcRenderer.invoke('app:saveSettings', patch),

  listDocuments: (rootPath) => ipcRenderer.invoke('documents:list', rootPath),
  includeDocumentFiles: (rootPath) => ipcRenderer.invoke('documents:includeFiles', rootPath),
  includeDocumentFolder: (rootPath) => ipcRenderer.invoke('documents:includeFolder', rootPath),
  removeDocumentEntry: (rootPath, entry) =>
    ipcRenderer.invoke('documents:removeEntry', rootPath, entry),
  readDocument: (rootPath, path) => ipcRenderer.invoke('document:read', rootPath, path),
  reviewDocument: (rootPath, path) => ipcRenderer.invoke('document:review', rootPath, path),
  openDocumentExternally: (rootPath, path) =>
    ipcRenderer.invoke('document:openExternally', rootPath, path),
  openExternalLink: (url) => ipcRenderer.invoke('link:openExternal', url),
}

contextBridge.exposeInMainWorld('knightbook', api)
