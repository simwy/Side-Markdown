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

export type ExportRequest = {
  // 文档标题（用于 HTML/PDF/Word 顶部 title）
  title: string
  // 用于保存对话框默认文件名
  nameHint?: string
  // 已经渲染好的 HTML（建议来自 renderer：Markdown -> safe HTML）
  html: string
}

export type ExportResponse = {
  path: string
  name: string
}

export type SessionState = {
  // 仅持久化“有路径”的文件 tab；无路径（未保存）不纳入会话恢复
  openFilePaths: string[]
  // 上次激活的文件路径（可选）
  activeFilePath?: string
}

export type MenuCommand =
  | { type: 'file:new' }
  | { type: 'file:open' }
  | { type: 'file:save' }
  | { type: 'file:saveAs' }
  | { type: 'file:exportHtml' }
  | { type: 'file:exportPdf' }
  | { type: 'file:exportWord' }
  | { type: 'file:closeTab' }
  | { type: 'file:quit' }
  | { type: 'edit:undo' }
  | { type: 'edit:redo' }
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
  // 贴边模式下用户调整后的“展开高度”（用于记忆；不一定在设置面板中暴露）
  shownHeightPx?: number
}

export type AppSettings = {
  theme: ThemeMode
  locale: Locale
  dock: DockSettings
}

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported'
  currentVersion: string
  availableVersion?: string
  progress?: {
    percent?: number
    transferred?: number
    total?: number
    bytesPerSecond?: number
  }
  error?: string
}


