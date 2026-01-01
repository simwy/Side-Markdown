import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, MenuCommand, OpenedFile, SaveFileRequest, SaveFileResponse } from './shared'

export type ElectronAPI = {
  openFiles: () => Promise<OpenedFile[]>
  saveFile: (req: SaveFileRequest) => Promise<SaveFileResponse | null>
  saveFileAs: (req: SaveFileRequest) => Promise<SaveFileResponse | null>
  quit: () => Promise<void>
  onMenuCommand: (handler: (cmd: MenuCommand) => void) => () => void
  onOpenedFiles: (handler: (files: OpenedFile[]) => void) => () => void
  windowMinimize: () => Promise<void>
  windowToggleMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximized: (handler: (isMaximized: boolean) => void) => () => void
  windowDock: (mode: 'left' | 'center' | 'right') => Promise<void>
  onWindowDockMode: (handler: (mode: 'left' | 'center' | 'right') => void) => () => void
  getSettings: () => Promise<AppSettings>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  onSettingsChanged: (handler: (settings: AppSettings) => void) => () => void
}

const api: ElectronAPI = {
  openFiles: () => ipcRenderer.invoke('fs:openFiles'),
  saveFile: (req) => ipcRenderer.invoke('fs:saveFile', req),
  saveFileAs: (req) => ipcRenderer.invoke('fs:saveFileAs', req),
  quit: () => ipcRenderer.invoke('app:quit'),
  onMenuCommand: (handler) => {
    const listener = (_evt: Electron.IpcRendererEvent, cmd: MenuCommand) => handler(cmd)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  onOpenedFiles: (handler) => {
    const listener = (_evt: Electron.IpcRendererEvent, files: OpenedFile[]) => handler(files)
    ipcRenderer.on('fs:openedFiles', listener)
    return () => ipcRenderer.removeListener('fs:openedFiles', listener)
  },
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (handler) => {
    const listener = (_evt: Electron.IpcRendererEvent, isMaximized: boolean) => handler(isMaximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
  windowDock: (mode) => ipcRenderer.invoke('window:dock', mode),
  onWindowDockMode: (handler) => {
    const listener = (_evt: Electron.IpcRendererEvent, mode: 'left' | 'center' | 'right') => handler(mode)
    ipcRenderer.on('window:dockMode', listener)
    return () => ipcRenderer.removeListener('window:dockMode', listener)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  onSettingsChanged: (handler) => {
    const listener = (_evt: Electron.IpcRendererEvent, settings: AppSettings) => handler(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)


