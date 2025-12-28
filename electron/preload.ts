import { contextBridge, ipcRenderer } from 'electron'
import type { MenuCommand, OpenedFile, SaveFileRequest, SaveFileResponse } from './shared'

export type ElectronAPI = {
  openFiles: () => Promise<OpenedFile[]>
  saveFile: (req: SaveFileRequest) => Promise<SaveFileResponse | null>
  saveFileAs: (req: SaveFileRequest) => Promise<SaveFileResponse | null>
  quit: () => Promise<void>
  onMenuCommand: (handler: (cmd: MenuCommand) => void) => () => void
  onOpenedFiles: (handler: (files: OpenedFile[]) => void) => () => void
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
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)


