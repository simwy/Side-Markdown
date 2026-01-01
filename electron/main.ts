import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import {
  APP_TITLE,
  type EncodingName,
  type MenuCommand,
  type OpenedFile,
  type SaveFileRequest,
  type SaveFileResponse
} from './shared'

const isMac = process.platform === 'darwin'
const DOCK_MARGIN_PX = 10
const DOCK_PEEK_PX = 14
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
let dockTimer: NodeJS.Timeout | null = null
let dockMode: 'left' | 'right' | null = null

function stopDocking() {
  dockMode = null
  if (dockTimer) {
    clearInterval(dockTimer)
    dockTimer = null
  }
}

function getDockDisplay(win: BrowserWindow) {
  const b = win.getBounds()
  return screen.getDisplayMatching(b)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function calcDockTargets(win: BrowserWindow, mode: 'left' | 'right') {
  const display = getDockDisplay(win)
  const wa = display.workArea
  const b = win.getBounds()

  const width = clamp(b.width, 520, wa.width)
  const height = clamp(b.height, 420, wa.height)
  const y = clamp(b.y, wa.y, wa.y + wa.height - height)

  const shownX = mode === 'left' ? wa.x + DOCK_MARGIN_PX : wa.x + wa.width - width - DOCK_MARGIN_PX
  const hiddenX =
    mode === 'left'
      ? wa.x + DOCK_MARGIN_PX - (width - DOCK_PEEK_PX)
      : wa.x + wa.width - DOCK_MARGIN_PX - DOCK_PEEK_PX

  return { workArea: wa, width, height, y, shownX, hiddenX }
}

function startDocking(win: BrowserWindow, mode: 'left' | 'right') {
  dockMode = mode

  const { hiddenX, width, height, y } = calcDockTargets(win, mode)
  win.setBounds({ x: Math.round(hiddenX), y: Math.round(y), width: Math.round(width), height: Math.round(height) }, true)

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
    const { workArea, shownX, hiddenX } = calcDockTargets(win, dockMode)

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

    const shouldShow = cursorInWindow || onEdgeTrigger
    const targetX = shouldShow ? shownX : hiddenX

    const dx = targetX - b.x
    if (Math.abs(dx) <= DOCK_STEP_PX) {
      if (b.x !== Math.round(targetX)) win.setBounds({ x: Math.round(targetX) }, true)
      return
    }
    const step = dx > 0 ? DOCK_STEP_PX : -DOCK_STEP_PX
    win.setBounds({ x: Math.round(b.x + step) }, true)
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
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

  ipcMain.handle('window:isAlwaysOnTop', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    return win?.isAlwaysOnTop() ?? false
  })

  ipcMain.handle('window:setAlwaysOnTop', async (evt, value: boolean) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win) return
    // macOS 用 floating 更符合“钉住到最上层”的直觉
    win.setAlwaysOnTop(!!value, 'floating')
    win.webContents.send('window:alwaysOnTop', !!value)
  })

  ipcMain.handle('window:toggleAlwaysOnTop', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win) return false
    const next = !win.isAlwaysOnTop()
    win.setAlwaysOnTop(next, 'floating')
    win.webContents.send('window:alwaysOnTop', next)
    return next
  })

  ipcMain.handle('window:dock', async (evt, mode: 'left' | 'center' | 'right') => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win) return

    if (mode === 'center') {
      stopDocking()
      const display = getDockDisplay(win)
      const wa = display.workArea
      const b = win.getBounds()
      const x = wa.x + Math.round((wa.width - b.width) / 2)
      const y = wa.y + Math.round((wa.height - b.height) / 2)
      win.setBounds({ x, y }, true)
      return
    }

    // left / right
    startDocking(win, mode)
  })
})


