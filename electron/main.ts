import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import {
  APP_TITLE,
  type AppSettings,
  type EncodingName,
  type MenuCommand,
  type OpenedFile,
  type SaveFileRequest,
  type SaveFileResponse
} from './shared'
import { getDefaultSettings, mergeSettings, readSettings, sanitizeSettings, writeSettings } from './settings'

const isMac = process.platform === 'darwin'
const DOCK_MARGIN_PX = 10
const DOCK_EDGE_TRIGGER_PX = 2
const DOCK_TICK_MS = 40
const DOCK_STEP_PX = 26

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
        { label: '剪切', accelerator: accel('Ctrl+X', 'Cmd+X'), click: () => sendMenuCommand(winGetter(), { type: 'edit:cut' }) },
        { label: '复制', accelerator: accel('Ctrl+C', 'Cmd+C'), click: () => sendMenuCommand(winGetter(), { type: 'edit:copy' }) },
        { label: '粘贴', accelerator: accel('Ctrl+V', 'Cmd+V'), click: () => sendMenuCommand(winGetter(), { type: 'edit:paste' }) },
        { type: 'separator' },
        { label: '全选', accelerator: accel('Ctrl+A', 'Cmd+A'), click: () => sendMenuCommand(winGetter(), { type: 'edit:selectAll' }) },
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
let dockDisplayId: number | null = null
let dockFullBounds: { width: number; height: number; y: number } | null = null
let dockShown: boolean = false
let dockPrevMinSize: { width: number; height: number } | null = null
let dockInternalOps = 0
let dockLastHoverAt = 0

function stopDocking() {
  dockMode = null
  dockDisplayId = null
  dockFullBounds = null
  dockShown = false
  // 退出贴边后取消置顶（贴边期间临时置顶）
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(false)
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

function cancelDockingDueToUserMove(win: BrowserWindow) {
  if (!dockMode) return
  const mode = dockMode
  const restoreMin = dockPrevMinSize
  const b = win.getBounds()
  const targetWidth = appSettings.dock.shownWidthPx
  const targetHeight = dockFullBounds?.height ?? b.height

  stopDocking()
  win.webContents.send('window:dockMode', 'center')

  if (restoreMin) win.setMinimumSize(restoreMin.width, restoreMin.height)

  // 取消贴边后，保留用户拖动到的新位置，只恢复一个可用宽度（200px）
  if (b.width < targetWidth) {
    const rightEdge = b.x + b.width
    const x = mode === 'right' ? rightEdge - targetWidth : b.x
    setBoundsInternal(win, { x: Math.round(x), width: targetWidth, height: targetHeight }, true)
  }
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
    dockFullBounds = { width: b.width, height: b.height, y: b.y }
  }
  dockShown = false
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
    const hovering = cursorInWindow || onEdgeTrigger
    if (hovering) dockLastHoverAt = now

    // 延迟收起：鼠标离开后等待 hideDelayMs 再缩回去
    const shouldShow = hovering || now - dockLastHoverAt < appSettings.dock.hideDelayMs
    dockShown = shouldShow
    const target = shouldShow ? targets.shown : targets.hidden

    // 动画：宽度（以及右贴边时的 x）逐步逼近目标
    const dw = target.width - b.width
    const stepW = Math.abs(dw) <= DOCK_STEP_PX ? dw : dw > 0 ? DOCK_STEP_PX : -DOCK_STEP_PX

    let nextWidth = b.width + stepW
    if (Math.abs(dw) <= DOCK_STEP_PX) nextWidth = target.width

    let nextX = b.x
    if (dockMode === 'left') {
      nextX = target.x
    } else {
      // 右贴边：保持右边缘对齐
      const rightEdge = target.x + target.width
      nextX = rightEdge - nextWidth
    }

    const changed = nextWidth !== b.width || nextX !== b.x
    if (changed) {
      setBoundsInternal(
        win,
        { x: Math.round(nextX), width: Math.round(nextWidth), y: Math.round(target.y), height: Math.round(target.height) },
        true
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

  // 贴边模式下：用户只要主动移动/改变大小，就取消贴边（但不影响我们自己的动画 setBounds）
  mainWindow.on('move', () => {
    if (!mainWindow) return
    if (!dockMode) return
    if (dockInternalOps > 0) return
    cancelDockingDueToUserMove(mainWindow)
  })
  mainWindow.on('resize', () => {
    if (!mainWindow) return
    if (!dockMode) return
    if (dockInternalOps > 0) return
    cancelDockingDueToUserMove(mainWindow)
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


