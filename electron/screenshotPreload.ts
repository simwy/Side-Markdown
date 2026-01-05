import { contextBridge, desktopCapturer, ipcRenderer } from 'electron'

type GetThumbnailArgs = {
  displayId: string
  thumbnailWidth: number
  thumbnailHeight: number
}

type FinishArgs = {
  token: string
  data: ArrayBuffer
  mime?: string
}

type ScreenshotAPI = {
  getThumbnail: (args: GetThumbnailArgs) => Promise<{ dataUrl: string }>
  finish: (args: FinishArgs) => Promise<boolean>
  cancel: (args: { token: string }) => Promise<boolean>
}

const api: ScreenshotAPI = {
  getThumbnail: async (args) => {
    const width = Math.max(1, Math.floor(Number(args.thumbnailWidth) || 1))
    const height = Math.max(1, Math.floor(Number(args.thumbnailHeight) || 1))
    const displayId = String(args.displayId || '')

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })

    // Electron populates display_id for screen sources; fall back to first.
    const matched =
      sources.find((s) => String((s as unknown as { display_id?: unknown }).display_id || '') === displayId) ?? sources[0]
    const dataUrl = matched?.thumbnail?.toDataURL?.() || ''
    return { dataUrl }
  },
  finish: async (args) => {
    return await ipcRenderer.invoke('screenshot:finish', args)
  },
  cancel: async (args) => {
    return await ipcRenderer.invoke('screenshot:cancel', args)
  }
}

contextBridge.exposeInMainWorld('smScreenshot', api)

