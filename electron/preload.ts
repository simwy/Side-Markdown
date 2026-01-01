import { contextBridge, ipcRenderer } from 'electron'
import type { MenuCommand, OpenedFile, SaveFileRequest, SaveFileResponse } from './shared'

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
  windowIsAlwaysOnTop: () => Promise<boolean>
  windowSetAlwaysOnTop: (value: boolean) => Promise<void>
  windowToggleAlwaysOnTop: () => Promise<boolean>
  onWindowAlwaysOnTop: (handler: (value: boolean) => void) => () => void
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
  windowIsAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
  windowSetAlwaysOnTop: (value) => ipcRenderer.invoke('window:setAlwaysOnTop', value),
  windowToggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  onWindowAlwaysOnTop: (handler) => {
    const listener = (_evt: Electron.IpcRendererEvent, value: boolean) => handler(value)
    ipcRenderer.on('window:alwaysOnTop', listener)
    return () => ipcRenderer.removeListener('window:alwaysOnTop', listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)


