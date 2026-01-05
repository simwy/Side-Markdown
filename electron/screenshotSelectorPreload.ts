import { contextBridge, desktopCapturer, ipcRenderer } from 'electron'

type RegionRect = {
  x: number
  y: number
  width: number
  height: number
}

type SourceInfo = {
  id: string
  name: string
  thumbnail: string
}

type DisplayInfo = {
  width: number
  height: number
  scaleFactor: number
}

type I18nStrings = Record<string, string>

export type ScreenshotSelectorAPI = {
  i18n: I18nStrings
  getDisplayInfo: () => Promise<DisplayInfo>
  getFullScreenshot: () => Promise<{ dataUrl: string }>
  getSources: () => Promise<{ windows: SourceInfo[]; screens: SourceInfo[] }>
  captureRegion: (rect: RegionRect) => Promise<void>
  captureWindow: (sourceId: string) => Promise<void>
  captureFullscreen: () => Promise<void>
  cancel: () => Promise<void>
}

// Get i18n strings injected by main process
const i18nStrings: I18nStrings = (window as unknown as { __SCREENSHOT_I18N__?: I18nStrings }).__SCREENSHOT_I18N__ || {}

const api: ScreenshotSelectorAPI = {
  i18n: i18nStrings,

  getDisplayInfo: async () => {
    return await ipcRenderer.invoke('screenshot-selector:getDisplayInfo')
  },

  getFullScreenshot: async () => {
    const info = await ipcRenderer.invoke('screenshot-selector:getDisplayInfo') as DisplayInfo
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: info.width, height: info.height }
    })
    const primary = sources[0]
    return { dataUrl: primary?.thumbnail?.toDataURL?.() || '' }
  },

  getSources: async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 },
      fetchWindowIcons: false
    })
    
    const windows: SourceInfo[] = []
    const screens: SourceInfo[] = []
    
    for (const source of sources) {
      const info: SourceInfo = {
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail?.toDataURL?.() || ''
      }
      if (source.id.startsWith('screen:')) {
        screens.push(info)
      } else {
        windows.push(info)
      }
    }
    
    return { windows, screens }
  },

  captureRegion: async (rect) => {
    await ipcRenderer.invoke('screenshot-selector:captureRegion', rect)
  },

  captureWindow: async (sourceId) => {
    await ipcRenderer.invoke('screenshot-selector:captureWindow', sourceId)
  },

  captureFullscreen: async () => {
    await ipcRenderer.invoke('screenshot-selector:captureFullscreen')
  },

  cancel: async () => {
    await ipcRenderer.invoke('screenshot-selector:cancel')
  }
}

contextBridge.exposeInMainWorld('smScreenshotSelector', api)
