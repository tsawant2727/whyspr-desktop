import type { ElectronAPI } from '@electron-toolkit/preload'
import type { SalesCopilotApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: SalesCopilotApi
  }
}

export {}
