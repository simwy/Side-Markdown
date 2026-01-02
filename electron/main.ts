import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import {
  APP_TITLE,
  type AppSettings,
  type EncodingName,
  type ExportRequest,
  type ExportResponse,
  type MenuCommand,
  type OpenedFile,
  type SaveFileRequest,
  type SaveFileResponse
} from './shared'
import { getDefaultSettings, mergeSettings, readSettings, sanitizeSettings, writeSettings } from './settings'

const isMac = process.platform === 'darwin'
const DOCK_MARGIN_PX = 10
const DOCK_EDGE_TRIGGER_PX = 2
// 贴边逻辑 tick：用于检测 hover / blur / delay
const DOCK_TICK_MS = 10

// ===== Single instance guard =====
// dev 模式下如果启动器/重启脚本出现抖动，可能会短时间拉起第二个进程；这里兜底避免“双实例”
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

function getPreloadPath() {
  // tsup 输出到 dist-electron/preload.cjs
  return path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')
}

function getIndexHtmlPath() {
  // vite build 输出到 dist/index.html
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

function sendMenuCommand(win: BrowserWindow | null, cmd: MenuCommand) {
  if (!win) return
  win.webContents.send('menu:command', cmd)
}

function mapDetectedToEncodingName(detected?: string): EncodingName {
  const e = (detected ?? '').toLowerCase()
  if (e.includes('utf-16le') || e.includes('utf16le')) return 'utf16le'
  if (e.includes('gb18030')) return 'gb18030'
  if (e.includes('gbk') || e.includes('gb2312')) return 'gbk'
  if (e.includes('windows-1252') || e.includes('win1252') || e.includes('iso-8859-1')) return 'windows1252'
  return 'utf8'
}

function decodeBuffer(buf: Buffer, encoding: EncodingName): string {
  // iconv-lite 支持常见编码（含 GBK/GB18030/Win1252/UTF16LE）
  if (encoding === 'utf8') return buf.toString('utf8')
  return iconv.decode(buf, encoding)
}

function encodeString(text: string, encoding: EncodingName): Buffer {
  if (encoding === 'utf8') return Buffer.from(text, 'utf8')
  return iconv.encode(text, encoding)
}

async function openFilesWithDialog(win: BrowserWindow): Promise<OpenedFile[]> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '打开',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文本文件', extensions: ['txt', 'md', 'markdown', 'log', 'json', 'yaml', 'yml'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (canceled || filePaths.length === 0) return []

  const results: OpenedFile[] = []
  for (const p of filePaths) {
    try {
      const buf = await fs.readFile(p)
      const detected = chardet.detect(buf) as string | undefined
      const encoding = mapDetectedToEncodingName(detected)
      const content = decodeBuffer(buf, encoding)
      results.push({
        path: p,
        name: path.basename(p),
        encoding,
        content
      })
    } catch (err) {
      await dialog.showMessageBox(win, {
        type: 'error',
        title: '打开失败',
        message: `无法打开文件：${p}`,
        detail: err instanceof Error ? err.message : String(err)
      })
    }
  }
  return results
}

async function openFilePaths(filePaths: string[]): Promise<OpenedFile[]> {
  const results: OpenedFile[] = []
  for (const p of filePaths) {
    try {
      const buf = await fs.readFile(p)
      const detected = chardet.detect(buf) as string | undefined
      const encoding = mapDetectedToEncodingName(detected)
      const content = decodeBuffer(buf, encoding)
      results.push({
        path: p,
        name: path.basename(p),
        encoding,
        content
      })
    } catch {
      // 这里通常是“文件不存在/无权限/临时文件”，不阻断其它文件
      dialog.showErrorBox('打开失败', `无法打开文件：${p}`)
    }
  }
  return results
}

async function saveFileWithDialog(win: BrowserWindow, req: SaveFileRequest, forceSaveAs: boolean): Promise<SaveFileResponse | null> {
  let targetPath = req.path

  if (!targetPath || forceSaveAs) {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '保存',
      defaultPath: req.nameHint ?? (req.path ? path.basename(req.path) : 'Untitled.txt'),
      filters: [
        { name: '文本文件', extensions: ['txt', 'md', 'markdown'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (canceled || !filePath) return null
    targetPath = filePath
  }

  try {
    const buf = encodeString(req.content, req.encoding)
    await fs.writeFile(targetPath, buf)
    return { path: targetPath, name: path.basename(targetPath) }
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: '保存失败',
      message: `无法保存文件：${targetPath}`,
      detail: err instanceof Error ? err.message : String(err)
    })
    return null
  }
}

function safeFileStem(nameHint?: string) {
  const raw = (nameHint ?? '').trim()
  if (!raw) return 'Untitled'
  // 只取文件名部分，避免 defaultPath 带入意外路径
  const base = path.basename(raw)
  // 去掉最后一个扩展名
  return base.replace(/\.[^./\\]+$/, '') || 'Untitled'
}

function escapeHtmlText(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function makeExportHtmlDocument(title: string, bodyHtml: string) {
  const safeTitle = escapeHtmlText(title || APP_TITLE)
  // 注意：bodyHtml 由 renderer 生成（已 sanitize），这里不再二次转义
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: #fff;
        color: #111827;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial;
        line-height: 1.6;
      }
      .doc {
        max-width: 900px;
        margin: 0 auto;
        padding: 28px 22px 40px;
      }
      h1,h2,h3,h4,h5,h6 { line-height: 1.25; margin: 1.1em 0 0.55em; }
      p { margin: 0.65em 0; }
      img { max-width: 100%; height: auto; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      blockquote {
        margin: 0.9em 0;
        padding: 0.2em 1em;
        border-left: 4px solid #e5e7eb;
        color: #374151;
        background: #f9fafb;
      }
      hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.2em 0; }
      table { border-collapse: collapse; width: 100%; margin: 0.9em 0; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 10px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 0.95em;
        background: #f3f4f6;
        padding: 0.15em 0.35em;
        border-radius: 6px;
      }
      pre {
        overflow: auto;
        padding: 12px 14px;
        background: #0b1220;
        color: #e5e7eb;
        border-radius: 10px;
      }
      pre code { background: transparent; padding: 0; color: inherit; }
      @media print {
        .doc { max-width: none; padding: 0; }
        a { color: #111827; text-decoration: underline; }
        pre { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="doc">
      ${bodyHtml}
    </main>
  </body>
</html>`
}

function makeWordHtmlDocument(title: string, bodyHtml: string) {
  // Word 兼容：使用 .doc（HTML）即可直接打开；避免额外依赖生成 docx
  const safeTitle = escapeHtmlText(title || APP_TITLE)
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
      </w:WordDocument>
    </xml>
    <style>
      body { font-family: "Microsoft YaHei", "PingFang SC", ui-sans-serif, system-ui; line-height: 1.6; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
      code, pre { font-family: Consolas, Menlo, Monaco, monospace; }
      pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    ${bodyHtml}
  </body>
</html>`
}

async function exportHtmlWithDialog(win: BrowserWindow, req: ExportRequest): Promise<ExportResponse | null> {
  const stem = safeFileStem(req.nameHint ?? req.title)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出为 HTML',
    defaultPath: `${stem}.html`,
    filters: [
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (canceled || !filePath) return null

  try {
    const doc = makeExportHtmlDocument(req.title || stem, req.html)
    await fs.writeFile(filePath, doc, 'utf8')
    return { path: filePath, name: path.basename(filePath) }
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: '导出失败',
      message: `无法导出 HTML：${filePath}`,
      detail: err instanceof Error ? err.message : String(err)
    })
    return null
  }
}

async function exportWordWithDialog(win: BrowserWindow, req: ExportRequest): Promise<ExportResponse | null> {
  const stem = safeFileStem(req.nameHint ?? req.title)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出为 Word',
    defaultPath: `${stem}.doc`,
    filters: [
      { name: 'Word 文档（.doc）', extensions: ['doc'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (canceled || !filePath) return null

  try {
    const doc = makeWordHtmlDocument(req.title || stem, req.html)
    await fs.writeFile(filePath, doc, 'utf8')
    return { path: filePath, name: path.basename(filePath) }
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: '导出失败',
      message: `无法导出 Word：${filePath}`,
      detail: err instanceof Error ? err.message : String(err)
    })
    return null
  }
}

async function exportPdfWithDialog(win: BrowserWindow, req: ExportRequest): Promise<ExportResponse | null> {
  const stem = safeFileStem(req.nameHint ?? req.title)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出为 PDF',
    defaultPath: `${stem}.pdf`,
    filters: [
      { name: 'PDF', extensions: ['pdf'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (canceled || !filePath) return null

  const htmlDoc = makeExportHtmlDocument(req.title || stem, req.html)
  const exportWin = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  try {
    await exportWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`)
    // 给排版/字体一点时间（更稳）
    await new Promise((r) => setTimeout(r, 50))
    const pdf = await exportWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    })
    await fs.writeFile(filePath, pdf)
    return { path: filePath, name: path.basename(filePath) }
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: '导出失败',
      message: `无法导出 PDF：${filePath}`,
      detail: err instanceof Error ? err.message : String(err)
    })
    return null
  } finally {
    exportWin.destroy()
  }
}

function buildAppMenu(winGetter: () => BrowserWindow | null) {
  const accel = (win: string, mac: string) => (isMac ? mac : win)

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_TITLE,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              {
                label: '退出',
                accelerator: 'Cmd+Q',
                click: () => app.quit()
              }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: accel('Ctrl+N', 'Cmd+N'), click: () => sendMenuCommand(winGetter(), { type: 'file:new' }) },
        { label: '打开…', accelerator: accel('Ctrl+O', 'Cmd+O'), click: () => sendMenuCommand(winGetter(), { type: 'file:open' }) },
        { type: 'separator' },
        { label: '保存', accelerator: accel('Ctrl+S', 'Cmd+S'), click: () => sendMenuCommand(winGetter(), { type: 'file:save' }) },
        { label: '另存为…', accelerator: accel('Ctrl+Shift+S', 'Cmd+Shift+S'), click: () => sendMenuCommand(winGetter(), { type: 'file:saveAs' }) },
        { type: 'separator' },
        {
          label: '导出',
          submenu: [
            { label: 'HTML…', click: () => sendMenuCommand(winGetter(), { type: 'file:exportHtml' }) },
            { label: 'PDF…', click: () => sendMenuCommand(winGetter(), { type: 'file:exportPdf' }) },
            { label: 'Word（.doc）…', click: () => sendMenuCommand(winGetter(), { type: 'file:exportWord' }) }
          ]
        },
        { type: 'separator' },
        { label: '关闭标签页', accelerator: accel('Ctrl+W', 'Cmd+W'), click: () => sendMenuCommand(winGetter(), { type: 'file:closeTab' }) },
        { type: 'separator' },
        ...(isMac
          ? []
          : [
              {
                label: '退出',
                accelerator: 'Alt+F4',
                click: () => app.quit()
              }
            ])
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: accel('Ctrl+Z', 'Cmd+Z'), click: () => sendMenuCommand(winGetter(), { type: 'edit:undo' }) },
        { label: '重做', accelerator: accel('Ctrl+Y', 'Cmd+Shift+Z'), click: () => sendMenuCommand(winGetter(), { type: 'edit:redo' }) },
        { type: 'separator' },
        // 这些操作必须作用于“当前聚焦控件”（CodeMirror/input 等），用 webContents 原生实现最稳
        { label: '剪切', accelerator: accel('Ctrl+X', 'Cmd+X'), click: () => winGetter()?.webContents.cut() },
        { label: '复制', accelerator: accel('Ctrl+C', 'Cmd+C'), click: () => winGetter()?.webContents.copy() },
        { label: '粘贴', accelerator: accel('Ctrl+V', 'Cmd+V'), click: () => winGetter()?.webContents.paste() },
        { type: 'separator' },
        { label: '全选', accelerator: accel('Ctrl+A', 'Cmd+A'), click: () => winGetter()?.webContents.selectAll() },
        { type: 'separator' },
        { label: '查找…', accelerator: accel('Ctrl+F', 'Cmd+F'), click: () => sendMenuCommand(winGetter(), { type: 'edit:find' }) },
        { label: '替换…', accelerator: accel('Ctrl+H', 'Cmd+Alt+F'), click: () => sendMenuCommand(winGetter(), { type: 'edit:replace' }) },
        { label: '转到行…', accelerator: accel('Ctrl+G', 'Cmd+L'), click: () => sendMenuCommand(winGetter(), { type: 'edit:gotoLine' }) },
        { type: 'separator' },
        { label: '插入时间/日期', accelerator: accel('F5', 'F5'), click: () => sendMenuCommand(winGetter(), { type: 'edit:insertDateTime' }) }
      ]
    },
    {
      label: '格式',
      submenu: [
        { label: '自动换行', type: 'checkbox', checked: true, click: () => sendMenuCommand(winGetter(), { type: 'format:wordWrapToggle' }) },
        { label: '字体…', click: () => sendMenuCommand(winGetter(), { type: 'format:font' }) }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '状态栏', type: 'checkbox', checked: true, click: () => sendMenuCommand(winGetter(), { type: 'view:statusBarToggle' }) },
        { type: 'separator' },
        { label: 'Markdown 预览模式（编辑/预览/分栏）', accelerator: accel('Ctrl+P', 'Cmd+P'), click: () => sendMenuCommand(winGetter(), { type: 'view:togglePreviewMode' }) }
      ]
    },
    {
      label: '编码',
      submenu: [
        { label: 'UTF-8', click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'utf8' }) },
        { label: 'UTF-16LE', click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'utf16le' }) },
        { type: 'separator' },
        { label: 'GBK', click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'gbk' }) },
        { label: 'GB18030', click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'gb18030' }) },
        { type: 'separator' },
        { label: 'ANSI（Windows-1252）', click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'windows1252' }) }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' } as Electron.MenuItemConstructorOptions] : [{ role: 'togglefullscreen' }]),
        { type: 'separator' },
        {
          label: '切换最大化/还原',
          accelerator: accel('F11', 'Ctrl+Cmd+F'),
          click: () => {
            const win = winGetter()
            if (!win) return
            if (win.isMaximized()) win.unmaximize()
            else win.maximize()
          }
        },
        { type: 'separator' },
        ...(isMac
          ? [
              {
                label: '关闭窗口',
                accelerator: 'Cmd+Shift+W',
                click: () => winGetter()?.close()
              }
            ]
          : [
              {
                label: '关闭窗口',
                click: () => winGetter()?.close()
              }
            ])
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '项目主页',
          click: async () => {
            await shell.openExternal('https://github.com/sim4next/Sim4SideMarkdown')
          }
        },
        {
          label: '切换深色/浅色（跟随系统）',
          click: () => {
            nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? 'light' : 'dark'
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

let mainWindow: BrowserWindow | null = null
let pendingOpenFilePaths: string[] = []

let appSettings: AppSettings = getDefaultSettings()

let dockTimer: NodeJS.Timeout | null = null
let dockMode: 'left' | 'right' | null = null
let dockPinned: boolean = false
let dockDisplayId: number | null = null
let dockFullBounds: { width: number; height: number; y: number } | null = null
let dockShown: boolean = false
let dockPrevMinSize: { width: number; height: number } | null = null
let dockInternalOps = 0
let dockLastHoverAt = 0
let dockHideRequestedAt = 0
let dockSettingsWriteTimer: NodeJS.Timeout | null = null
let windowAlwaysOnTop: boolean = false

function stopDocking() {
  dockMode = null
  dockPinned = false
  dockDisplayId = null
  dockFullBounds = null
  dockShown = false
  dockHideRequestedAt = 0
  // 退出贴边后取消置顶（贴边期间临时置顶）
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (windowAlwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating')
    else mainWindow.setAlwaysOnTop(false)
    mainWindow.webContents.send('window:dockPinned', false)
  }
  if (mainWindow && !mainWindow.isDestroyed() && dockPrevMinSize) {
    mainWindow.setMinimumSize(dockPrevMinSize.width, dockPrevMinSize.height)
  }
  dockPrevMinSize = null
  if (dockTimer) {
    clearInterval(dockTimer)
    dockTimer = null
  }
}

function setBoundsInternal(win: BrowserWindow, bounds: Partial<Electron.Rectangle>, animate: boolean) {
  dockInternalOps++
  try {
    win.setBounds(bounds as Electron.Rectangle, animate)
  } finally {
    // move/resize 事件会在 setBounds 之后异步触发，这里延迟释放“内部操作”标记
    setTimeout(() => {
      dockInternalOps = Math.max(0, dockInternalOps - 1)
    }, 0)
  }
}

function handleResizeWhileDocked(win: BrowserWindow) {
  if (!dockMode) return
  // 允许用户调整“宽度/高度/位置”，并记忆：
  // - 宽度（仅在展开状态下）：同步写回设置的 shownWidthPx（设置面板可见）
  // - 高度：写回设置的 shownHeightPx（用于记忆，不一定在面板中暴露）
  // 同时保持贴边对齐规则不变
  const b = win.getBounds()
  if (!dockFullBounds) {
    dockFullBounds = { width: b.width, height: b.height, y: b.y }
  } else {
    dockFullBounds = { ...dockFullBounds, height: b.height, y: b.y }
  }
  if (dockShown) {
    dockFullBounds = { ...dockFullBounds, width: b.width }
  }

  // 记录“用户期望的展开尺寸”
  // 注意：收缩态的宽度很窄（hiddenWidthPx），不应覆盖用户设置的展开宽度
  const nextDock = {
    ...appSettings.dock,
    ...(dockShown ? { shownWidthPx: clamp(b.width, 60, 2000) } : {}),
    shownHeightPx: clamp(b.height, 420, 5000)
  }
  const merged = sanitizeSettings(mergeSettings(appSettings, { dock: nextDock }))
  if (
    merged.dock.shownWidthPx !== appSettings.dock.shownWidthPx ||
    merged.dock.shownHeightPx !== appSettings.dock.shownHeightPx
  ) {
    applyAppSettings(merged)
  }

  const lockedDisplay = getDisplayById(dockDisplayId) ?? getDockDisplay(win)
  const targets = calcDockTargets(win, dockMode, lockedDisplay)
  const target = dockShown ? targets.shown : targets.hidden

  // 右贴边需要保持右边缘对齐
  let x = target.x
  if (dockMode === 'right') {
    const rightEdge = target.x + target.width
    x = rightEdge - target.width
  }

  setBoundsInternal(
    win,
    { x: Math.round(x), y: Math.round(target.y), width: Math.round(target.width), height: Math.round(target.height) },
    false
  )
}

function handleMoveWhileDocked(win: BrowserWindow) {
  if (!dockMode) return
  // 允许用户拖动改变 y（上下位置），但保持贴边宽度/x 逻辑不变
  const b = win.getBounds()
  if (!dockFullBounds) {
    dockFullBounds = { width: b.width, height: b.height, y: b.y }
  } else {
    dockFullBounds = { ...dockFullBounds, y: b.y }
  }

  const lockedDisplay = getDisplayById(dockDisplayId) ?? getDockDisplay(win)
  const targets = calcDockTargets(win, dockMode, lockedDisplay)
  const target = dockShown ? targets.shown : targets.hidden

  // 右贴边需要保持右边缘对齐
  let x = target.x
  if (dockMode === 'right') {
    const rightEdge = target.x + target.width
    x = rightEdge - target.width
  }

  setBoundsInternal(
    win,
    { x: Math.round(x), y: Math.round(target.y), width: Math.round(target.width), height: Math.round(target.height) },
    false
  )
}

function getDockDisplay(win: BrowserWindow) {
  const b = win.getBounds()
  return screen.getDisplayMatching(b)
}

function getDisplayById(id: number | null) {
  if (id == null) return null
  return screen.getAllDisplays().find((d) => d.id === id) ?? null
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function scheduleWriteAppSettings(next: AppSettings) {
  // 防抖：用户拖拽调整尺寸时，会连续触发 resize
  if (dockSettingsWriteTimer) clearTimeout(dockSettingsWriteTimer)
  dockSettingsWriteTimer = setTimeout(() => {
    dockSettingsWriteTimer = null
    void writeSettings(next)
  }, 300)
}

function applyAppSettings(next: AppSettings) {
  const prevTheme = appSettings.theme
  appSettings = next
  nativeTheme.themeSource = next.theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (prevTheme !== next.theme) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#ffffff')
    }
    mainWindow.webContents.send('settings:changed', next)
  }
  scheduleWriteAppSettings(next)
}

function calcDockTargets(
  win: BrowserWindow,
  mode: 'left' | 'right',
  displayOverride?: Electron.Display
) {
  const display = displayOverride ?? getDockDisplay(win)
  const wa = display.workArea
  const b = win.getBounds()

  // “缩放宽度”模式：显示宽度固定为 200px（按需求），隐藏宽度固定为 10px
  // 显示宽度也需要被工作区裁剪（比如非常窄的屏幕/分辨率）
  const fullWidth = clamp(appSettings.dock.shownWidthPx, 60, wa.width - DOCK_MARGIN_PX * 2)
  const fullHeight = clamp(dockFullBounds?.height ?? b.height, 420, wa.height)
  const y = clamp(dockFullBounds?.y ?? b.y, wa.y, wa.y + wa.height - fullHeight)

  // “缩放宽度”模式：隐藏时只保留一条边的宽度（peek），显示时恢复原宽度
  const hiddenWidth = clamp(appSettings.dock.hiddenWidthPx, 6, 200)
  const shownX = mode === 'left' ? wa.x + DOCK_MARGIN_PX : wa.x + wa.width - fullWidth - DOCK_MARGIN_PX
  const hiddenX = mode === 'left' ? wa.x + DOCK_MARGIN_PX : wa.x + wa.width - hiddenWidth - DOCK_MARGIN_PX

  return {
    workArea: wa,
    shown: { x: shownX, y, width: fullWidth, height: fullHeight },
    hidden: { x: hiddenX, y, width: hiddenWidth, height: fullHeight }
  }
}

function startDocking(win: BrowserWindow, mode: 'left' | 'right') {
  dockMode = mode
  // 关键：锁定“开始贴边时的屏幕”，避免多屏下边缘/收起状态导致匹配到另一块屏幕
  dockDisplayId = getDockDisplay(win).id
  {
    const b = win.getBounds()
    dockFullBounds = {
      width: b.width,
      height: appSettings.dock.shownHeightPx ?? b.height,
      y: b.y
    }
  }
  dockShown = false
  dockHideRequestedAt = 0
  // 贴边模式下临时置顶，确保始终在最前端（退出贴边会恢复）
  win.setAlwaysOnTop(true, 'floating')
  if (!dockPrevMinSize) {
    const [mw, mh] = win.getMinimumSize()
    dockPrevMinSize = { width: mw, height: mh }
  }
  // 进入贴边模式时临时放开最小宽度限制，否则 minWidth(900) 会导致无法缩到“隐藏宽度”
  win.setMinimumSize(appSettings.dock.hiddenWidthPx, dockPrevMinSize?.height ?? 0)
  win.webContents.send('window:dockMode', mode)
  dockLastHoverAt = Date.now()

  const lockedDisplay = getDisplayById(dockDisplayId) ?? getDockDisplay(win)
  const targets = calcDockTargets(win, mode, lockedDisplay)
  setBoundsInternal(
    win,
    {
      x: Math.round(targets.hidden.x),
      y: Math.round(targets.hidden.y),
      width: Math.round(targets.hidden.width),
      height: Math.round(targets.hidden.height)
    },
    true
  )

  if (dockTimer) return
  dockTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopDocking()
      return
    }
    if (!dockMode) {
      stopDocking()
      return
    }

    const win = mainWindow
    const b = win.getBounds()
    const lockedDisplay = getDisplayById(dockDisplayId) ?? getDockDisplay(win)
    const targets = calcDockTargets(win, dockMode, lockedDisplay)
    const { workArea } = targets

    const cursor = screen.getCursorScreenPoint()
    const cursorInWorkArea =
      cursor.x >= workArea.x &&
      cursor.x <= workArea.x + workArea.width &&
      cursor.y >= workArea.y &&
      cursor.y <= workArea.y + workArea.height

    const cursorInWindow = cursor.x >= b.x && cursor.x <= b.x + b.width && cursor.y >= b.y && cursor.y <= b.y + b.height

    const onEdgeTrigger =
      dockMode === 'left'
        ? cursorInWorkArea && cursor.x <= workArea.x + DOCK_EDGE_TRIGGER_PX
        : cursorInWorkArea && cursor.x >= workArea.x + workArea.width - DOCK_EDGE_TRIGGER_PX

    const now = Date.now()
    // 说明：
    // - `onEdgeTrigger` 只用于“隐藏状态下”触发展开（把鼠标顶到屏幕边缘就能拉出）。
    // - 已展开/刚失焦时，不应被 `onEdgeTrigger` 抵消回收逻辑，否则会出现“失焦后立即又弹出”的感觉。
    const hoveringToShow = cursorInWindow || onEdgeTrigger
    if (cursorInWindow) {
      dockLastHoverAt = now
      dockHideRequestedAt = 0 // 用户回到窗口（可见区域），取消回收请求
    }

    // 需求：非钉住状态下，“鼠标离开不回收”，而是“窗口失去焦点(blur)后回收”。
    // - 未展开时：hover（窗口内/边缘触发）展开
    // - 已展开时：
    //    - 钉住：保持展开
    //    - 非钉住：只要失焦就回收
    let shouldShow: boolean
    if (!dockShown) {
      // 如果刚刚因为 blur 回收：要求用户把鼠标移回“窗口可见区域（那条窄边）”再展开，
      // 避免在屏幕边缘点其它东西后又立刻弹回。
      if (dockHideRequestedAt > 0 && !cursorInWindow) {
        shouldShow = false
      } else {
        shouldShow = hoveringToShow
      }
    } else if (dockPinned) {
      shouldShow = true
    } else if (dockHideRequestedAt > 0) {
      // 回收只由 blur 触发：避免“悬停展开但窗口未聚焦”导致展开/回收抖动循环
      shouldShow = false
    } else {
      shouldShow = true
    }
    dockShown = shouldShow
    const target = shouldShow ? targets.shown : targets.hidden

    // 需求：弹出/收缩过程不做逐步动画，直接设置到目标宽度（更干脆、更稳定）
    const nextWidth = target.width
    let nextX = b.x
    if (dockMode === 'left') {
      nextX = target.x
    } else {
      // 右贴边：保持右边缘对齐
      const rightEdge = target.x + target.width
      nextX = rightEdge - nextWidth
    }

    const changed = nextWidth !== b.width || nextX !== b.x || b.y !== target.y || b.height !== target.height
    if (changed) {
      setBoundsInternal(
        win,
        { x: Math.round(nextX), width: Math.round(nextWidth), y: Math.round(target.y), height: Math.round(target.height) },
        false
      )
    }
  }, DOCK_TICK_MS)
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 520,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#ffffff',
    frame: false,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 主进程监听窗口状态变化，通知 renderer 更新“最大化/还原”按钮状态
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))

  // 恢复“居中模式下置顶”状态
  if (windowAlwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating')

  // 贴边模式下：允许用户移动/改变大小，但保持贴边规则（不再“拖动就退出贴边”）
  mainWindow.on('move', () => {
    if (!mainWindow) return
    if (!dockMode) return
    if (dockInternalOps > 0) return
    handleMoveWhileDocked(mainWindow)
  })
  mainWindow.on('resize', () => {
    if (!mainWindow) return
    if (!dockMode) return
    if (dockInternalOps > 0) return
    // 修改窗体大小不退出靠边模式：同步高度/位置，并强制回贴边宽度
    handleResizeWhileDocked(mainWindow)
  })

  // 非钉住贴边模式：当窗口失去焦点（blur）就触发回收
  mainWindow.on('blur', () => {
    if (!mainWindow) return
    if (!dockMode) return
    if (dockPinned) return
    if (!dockShown) return
    dockHideRequestedAt = Date.now()

    // 立即回收：直接切到收缩宽度（避免等待 tick/延迟）
    const lockedDisplay = getDisplayById(dockDisplayId) ?? getDockDisplay(mainWindow)
    const targets = calcDockTargets(mainWindow, dockMode, lockedDisplay)
    dockShown = false
    setBoundsInternal(
      mainWindow,
      {
        x: Math.round(targets.hidden.x),
        y: Math.round(targets.hidden.y),
        width: Math.round(targets.hidden.width),
        height: Math.round(targets.hidden.height)
      },
      false
    )
  })

  // 重新获得焦点时：清掉“回收请求”标记（避免后续展开/回收状态机被旧标记影响）
  mainWindow.on('focus', () => {
    if (!dockMode) return
    dockHideRequestedAt = 0
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
    // 默认不自动打开 DevTools；如需打开，请设置环境变量：ELECTRON_OPEN_DEVTOOLS=1
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    await mainWindow.loadFile(getIndexHtmlPath())
  }

  buildAppMenu(() => mainWindow)

  // macOS: Finder 双击文件启动时，会通过 open-file 事件带入路径
  if (pendingOpenFilePaths.length > 0) {
    const pathsToOpen = [...pendingOpenFilePaths]
    pendingOpenFilePaths = []
    try {
      const opened = await openFilePaths(pathsToOpen)
      mainWindow.webContents.send('fs:openedFiles', opened)
    } catch {
      // ignore
    }
  }
}

app.setName(APP_TITLE)

// 第二个实例启动时，把焦点拉回第一个实例
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  // macOS 常规行为：关闭所有窗口不退出
  if (!isMac) app.quit()
})

// macOS: Finder “打开方式”/双击关联文件
app.on('open-file', async (event, filePath) => {
  event.preventDefault()
  if (mainWindow) {
    try {
      const opened = await openFilePaths([filePath])
      mainWindow.webContents.send('fs:openedFiles', opened)
    } catch {
      // ignore
    }
  } else {
    pendingOpenFilePaths.push(filePath)
  }
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createMainWindow()
})

app.whenReady().then(async () => {
  // 读取并应用设置（主题/语言/贴边参数）
  appSettings = await readSettings()
  nativeTheme.themeSource = appSettings.theme

  await createMainWindow()

  // ===== IPC =====
  ipcMain.handle('fs:openFiles', async () => {
    if (!mainWindow) return []
    return await openFilesWithDialog(mainWindow)
  })

  ipcMain.handle('fs:saveFile', async (_evt, req: SaveFileRequest) => {
    if (!mainWindow) return null
    return await saveFileWithDialog(mainWindow, req, false)
  })

  ipcMain.handle('fs:saveFileAs', async (_evt, req: SaveFileRequest) => {
    if (!mainWindow) return null
    return await saveFileWithDialog(mainWindow, req, true)
  })

  // ===== Export =====
  ipcMain.handle('export:html', async (_evt, req: ExportRequest) => {
    if (!mainWindow) return null
    return await exportHtmlWithDialog(mainWindow, req)
  })

  ipcMain.handle('export:word', async (_evt, req: ExportRequest) => {
    if (!mainWindow) return null
    return await exportWordWithDialog(mainWindow, req)
  })

  ipcMain.handle('export:pdf', async (_evt, req: ExportRequest) => {
    if (!mainWindow) return null
    return await exportPdfWithDialog(mainWindow, req)
  })

  ipcMain.handle('app:quit', async () => {
    app.quit()
  })

  // ===== Window controls (frameless title bar) =====
  ipcMain.handle('window:minimize', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    win?.minimize()
  })

  ipcMain.handle('window:toggleMaximize', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle('window:close', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    win?.close()
  })

  ipcMain.handle('window:isMaximized', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    return win?.isMaximized() ?? false
  })

  ipcMain.handle('window:dock', async (evt, mode: 'left' | 'center' | 'right') => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win) return

    if (mode === 'center') {
      // 退出贴边：恢复最小尺寸限制，并尽量恢复贴边前的窗口宽高
      const restore = dockFullBounds
      stopDocking()
      win.webContents.send('window:dockMode', 'center')
      const display = getDockDisplay(win)
      const wa = display.workArea
      const b = win.getBounds()
      const width = restore?.width ?? b.width
      const height = restore?.height ?? b.height
      const x = wa.x + Math.round((wa.width - width) / 2)
      const y = wa.y + Math.round((wa.height - height) / 2)
      win.setBounds({ x, y, width, height }, true)
      return
    }

    // left / right
    startDocking(win, mode)
  })

  ipcMain.handle('window:getDockPinned', async () => {
    return dockPinned
  })

  ipcMain.handle('window:setDockPinned', async (_evt, value: boolean) => {
    // 仅贴边模式可用
    if (!mainWindow || mainWindow.isDestroyed()) return false
    if (!dockMode) {
      dockPinned = false
      mainWindow.webContents.send('window:dockPinned', false)
      return false
    }
    dockPinned = !!value
    mainWindow.webContents.send('window:dockPinned', dockPinned)
    return dockPinned
  })

  ipcMain.handle('window:getAlwaysOnTop', async () => {
    return windowAlwaysOnTop
  })

  ipcMain.handle('window:setAlwaysOnTop', async (_evt, value: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false
    windowAlwaysOnTop = !!value
    // 贴边模式下始终临时置顶；这里只更新“退出贴边后是否保持置顶”的状态
    if (!dockMode) {
      if (windowAlwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating')
      else mainWindow.setAlwaysOnTop(false)
    }
    mainWindow.webContents.send('window:alwaysOnTop', windowAlwaysOnTop)
    return windowAlwaysOnTop
  })

  // ===== Settings =====
  ipcMain.handle('settings:get', async () => {
    return appSettings
  })

  ipcMain.handle('settings:update', async (_evt, patch: Partial<AppSettings>) => {
    const next = sanitizeSettings(mergeSettings(appSettings, patch))
    appSettings = next
    nativeTheme.themeSource = next.theme

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#ffffff')
      mainWindow.webContents.send('settings:changed', next)
    }

    await writeSettings(next)
    return next
  })
})


