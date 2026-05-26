import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  TranscriptSegment,
  Suggestion,
  CallArtifacts
} from '../shared/types'

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
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize-overlay')
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
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)

export type SalesCopilotApi = typeof api
