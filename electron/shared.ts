export const APP_TITLE = 'Sim4SideMarkdown'

export type EncodingName =
  | 'utf8'
  | 'utf16le'
  | 'gbk'
  | 'gb18030'
  | 'windows1252'

export type OpenedFile = {
  path: string
  name: string
  encoding: EncodingName
  content: string
}

export type SaveFileRequest = {
  path?: string
  nameHint?: string
  content: string
  encoding: EncodingName
}

export type SaveFileResponse = {
  path: string
  name: string
}

export type MenuCommand =
  | { type: 'file:new' }
  | { type: 'file:open' }
  | { type: 'file:save' }
  | { type: 'file:saveAs' }
  | { type: 'file:closeTab' }
  | { type: 'file:quit' }
  | { type: 'edit:undo' }
  | { type: 'edit:redo' }
  | { type: 'edit:cut' }
  | { type: 'edit:copy' }
  | { type: 'edit:paste' }
  | { type: 'edit:selectAll' }
  | { type: 'edit:find' }
  | { type: 'edit:replace' }
  | { type: 'edit:gotoLine' }
  | { type: 'edit:insertDateTime' }
  | { type: 'format:wordWrapToggle' }
  | { type: 'format:font' }
  | { type: 'view:statusBarToggle' }
  | { type: 'view:togglePreviewMode' }
  | { type: 'encoding:set'; encoding: EncodingName }
  | { type: 'window:minimize' }
  | { type: 'window:toggleMaximize' }
  | { type: 'window:close' }
  | { type: 'window:dock'; mode: 'left' | 'center' | 'right' }

export type ThemeMode = 'system' | 'dark' | 'light'
export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko'

export type DockSettings = {
  hideDelayMs: number
  hiddenWidthPx: number
  shownWidthPx: number
}

export type AppSettings = {
  theme: ThemeMode
  locale: Locale
  dock: DockSettings
}


