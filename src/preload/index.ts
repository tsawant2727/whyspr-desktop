import { contextBridge, ipcRenderer, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  TranscriptSegment,
  Suggestion,
  CallArtifacts
} from '../shared/types'
import type { AuthAndState } from '../shared/license'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:set', patch),
    applyTemplate: (templateId: string): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:apply-template', templateId),
    open: (): Promise<void> => ipcRenderer.invoke('settings:open')
  },
  window: {
    hide: (): Promise<void> => ipcRenderer.invoke('window:hide-overlay'),
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize-overlay'),
    resize: (width: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('window:resize-overlay', { width })
  },
  session: {
    start: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('session:start'),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('session:stop'),
    status: (): Promise<{ active: boolean }> => ipcRenderer.invoke('session:status'),
    requestSuggestion: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('session:request-suggestion'),
    sendSystemAudio: (chunk: ArrayBuffer): void => {
      ipcRenderer.send('session:audio-chunk:system', chunk)
    },
    sendMicAudio: (chunk: ArrayBuffer): void => {
      ipcRenderer.send('session:audio-chunk:mic', chunk)
    },
    saveRecording: (
      data: ArrayBuffer,
      mimeType: string
    ): Promise<{ ok: boolean; path?: string }> =>
      ipcRenderer.invoke('session:save-recording', { data, mimeType }),
    finalize: (): Promise<CallArtifacts | null> => ipcRenderer.invoke('session:finalize')
  },
  storage: {
    openRecordingsFolder: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('storage:open-recordings-folder'),
    openFile: (filePath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('storage:open-file', filePath),
    getRecordingsDir: (): Promise<string> => ipcRenderer.invoke('storage:get-recordings-dir'),
    chooseFolder: (): Promise<{ canceled: boolean; path?: string }> =>
      ipcRenderer.invoke('dialog:choose-folder')
  },
  // Whyspr backend (login, license state, heartbeat refresh)
  whyspr: {
    login: (
      email: string,
      password: string
    ): Promise<{ ok: true } | { ok: false; message: string }> =>
      ipcRenderer.invoke('whyspr:login', email, password),
    logout: (): Promise<{ ok: true }> => ipcRenderer.invoke('whyspr:logout'),
    refresh: (): Promise<AuthAndState> => ipcRenderer.invoke('whyspr:refresh'),
    snapshot: (): Promise<AuthAndState> => ipcRenderer.invoke('whyspr:snapshot'),
    hasSession: (): Promise<boolean> => ipcRenderer.invoke('whyspr:has-session')
  },
  // Tiny shell helper so renderer can open URLs (signup, support, upgrade) in
  // the user's default browser without needing nodeIntegration.
  shell: {
    openExternal: (url: string): Promise<void> => shell.openExternal(url)
  },
  on: {
    transcript: (cb: (seg: TranscriptSegment) => void) => {
      const listener = (_: unknown, seg: TranscriptSegment): void => cb(seg)
      ipcRenderer.on('transcript:update', listener)
      return () => ipcRenderer.removeListener('transcript:update', listener)
    },
    suggestion: (cb: (sug: Suggestion) => void) => {
      const listener = (_: unknown, sug: Suggestion): void => cb(sug)
      ipcRenderer.on('suggestion:update', listener)
      return () => ipcRenderer.removeListener('suggestion:update', listener)
    },
    sessionStatus: (cb: (s: { active: boolean; error?: string }) => void) => {
      const listener = (_: unknown, s: { active: boolean; error?: string }): void => cb(s)
      ipcRenderer.on('session:status', listener)
      return () => ipcRenderer.removeListener('session:status', listener)
    },
    settingsChanged: (cb: (settings: AppSettings) => void) => {
      const listener = (_: unknown, s: AppSettings): void => cb(s)
      ipcRenderer.on('settings:updated', listener)
      return () => ipcRenderer.removeListener('settings:updated', listener)
    },
    licenseState: (cb: (snap: AuthAndState) => void) => {
      const listener = (_: unknown, s: AuthAndState): void => cb(s)
      ipcRenderer.on('license:state', listener)
      return () => ipcRenderer.removeListener('license:state', listener)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Window {
    api: typeof api
    electron: typeof electronAPI
  }
}

export type SalesCopilotApi = typeof api
