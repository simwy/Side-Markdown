import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, Menu, nativeTheme, protocol, screen, session, shell, systemPreferences } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import {
  APP_TITLE,
  type AppSettings,
  type EncodingName,
  type ExportRequest,
  type ExportResponse,
  type ImageImportMode,
  type ImageImportRequest,
  type Locale,
  type MenuCommand,
  type OpenedFile,
  type SavedImage,
  type SessionState,
  type SaveFileRequest,
  type SaveFileResponse,
  type UpdateState
} from './shared'
import { getDefaultSettings, mergeSettings, readSettings, sanitizeSettings, writeSettings } from './settings'
import { readSession, writeSession } from './session'

const isMac = process.platform === 'darwin'
const ASSOCIATED_EXTS = new Set(['.md', '.markdown', '.txt'])
const DOCK_MARGIN_PX = 10
const DOCK_EDGE_TRIGGER_PX = 2
// 贴边逻辑 tick：用于检测 hover / blur / delay
const DOCK_TICK_MS = 10

// Allow renderer to load local files safely via smfile:// in both dev(http) and prod(file) modes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'smfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

function isImagePath(p: string) {
  const ext = path.extname(p).toLowerCase()
  return IMAGE_EXTS.has(ext)
}

function sanitizeFileStem(name: string) {
  const base = String(name || '').trim()
  // keep it simple: remove path separators and reserved characters
  return base
    .replace(/[\\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function docStemFromPath(docPath: string) {
  const base = path.basename(docPath)
  const stem = path.basename(base, path.extname(base))
  return sanitizeFileStem(stem) || 'document'
}

function assetsDirForDoc(docPath: string, assetsDirName: string) {
  return path.join(path.dirname(docPath), assetsDirName, docStemFromPath(docPath))
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true })
}

function tsName() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}`
}

async function uniqueDestPath(dir: string, stem: string, ext: string) {
  const safeStem = sanitizeFileStem(stem) || 'image'
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`
  const base = path.join(dir, `${safeStem}${safeExt}`)
  try {
    await fs.access(base)
  } catch {
    return base
  }
  for (let i = 1; i <= 999; i++) {
    const p = path.join(dir, `${safeStem}-${i}${safeExt}`)
    try {
      await fs.access(p)
    } catch {
      return p
    }
  }
  return path.join(dir, `${safeStem}-${Date.now()}${safeExt}`)
}

function makeLink(docPath: string, absPath: string, mode: ImageImportMode) {
  if (mode === 'absolute') return absPath
  const rel = path.relative(path.dirname(docPath), absPath)
  // Markdown uses forward slashes reliably
  return rel.replace(/\\/g, '/')
}

async function saveBufferAsImage(req: ImageImportRequest & { data: ArrayBuffer; mime?: string; nameHint?: string }): Promise<SavedImage> {
  const assetsDirName = req.assetsDirName || 'assets'
  const mode: ImageImportMode = req.mode || 'relative'

  const assetsDir = assetsDirForDoc(req.docPath, assetsDirName)
  await ensureDir(assetsDir)

  const mime = String(req.mime || '').toLowerCase()
  const extFromMime =
    mime === 'image/png'
      ? '.png'
      : mime === 'image/jpeg'
        ? '.jpg'
        : mime === 'image/gif'
          ? '.gif'
          : mime === 'image/webp'
            ? '.webp'
            : '.png'

  const dest = await uniqueDestPath(assetsDir, req.nameHint || `pasted-${tsName()}`, extFromMime)
  const buf = Buffer.from(new Uint8Array(req.data))
  await fs.writeFile(dest, buf)
  return { absPath: dest, link: makeLink(req.docPath, dest, mode), fileName: path.basename(dest) }
}

async function importImagePaths(req: ImageImportRequest & { filePaths: string[] }): Promise<SavedImage[]> {
  const assetsDirName = req.assetsDirName || 'assets'
  const mode: ImageImportMode = req.mode || 'relative'

  const assetsDir = assetsDirForDoc(req.docPath, assetsDirName)
  await ensureDir(assetsDir)

  const out: SavedImage[] = []
  for (const p of req.filePaths) {
    if (typeof p !== 'string' || p.length === 0) continue
    if (!isImagePath(p)) continue
    const ext = path.extname(p) || '.png'
    const stem = sanitizeFileStem(path.basename(p, ext)) || `image-${tsName()}`
    const dest = await uniqueDestPath(assetsDir, stem, ext)
    await fs.copyFile(p, dest)
    out.push({ absPath: dest, link: makeLink(req.docPath, dest, mode), fileName: path.basename(dest) })
  }
  return out
}

const TRACE_ANALYTICS_REQUESTS =
  process.env.SIDE_MARKDOWN_TRACE_ANALYTICS === '1' ||
  process.env.ANALYTICS_TRACE === '1' ||
  process.env.ELECTRON_TRACE_ANALYTICS === '1'

function setupAnalyticsRequestTrace() {
  if (!TRACE_ANALYTICS_REQUESTS) return

  const filter = { urls: ['*://*/*'] }
  const isAnalyticsUrl = (url: string) =>
    /(hm\.baidu\.com|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)\b/i.test(url) ||
    /\/(g\/)?collect\b/i.test(url) ||
    /\/mp\/collect\b/i.test(url)

  // eslint-disable-next-line no-console
  console.log('[analytics:req]', 'trace enabled (filtered)', [
    'hm.baidu.com',
    '*.googletagmanager.com',
    '*.google-analytics.com',
    'analytics.google.com',
    '*.doubleclick.net',
    '*/collect*'
  ])

  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (!isAnalyticsUrl(details.url)) return callback({})
    // eslint-disable-next-line no-console
    console.log('[analytics:req]', {
      phase: 'before',
      method: details.method,
      resourceType: details.resourceType,
      url: details.url
    })
    callback({})
  })

  session.defaultSession.webRequest.onCompleted(filter, (details) => {
    if (!isAnalyticsUrl(details.url)) return
    // eslint-disable-next-line no-console
    console.log('[analytics:req]', {
      phase: 'completed',
      method: details.method,
      statusCode: details.statusCode,
      fromCache: details.fromCache,
      url: details.url
    })
  })

  session.defaultSession.webRequest.onErrorOccurred(filter, (details) => {
    if (!isAnalyticsUrl(details.url)) return
    // eslint-disable-next-line no-console
    console.log('[analytics:req]', {
      phase: 'error',
      method: details.method,
      error: details.error,
      url: details.url
    })
  })
}

// ===== Dev userData isolation =====
// 重要：Electron 的单实例锁基于 app.getPath('userData')。
// 如果不同仓库/不同分支使用了相同的 package.json name，会共用同一个 userData 目录，导致“启动即退出/看似白屏”。
// dev 模式下强制隔离 userData，避免与其他实例冲突。
if (!app.isPackaged) {
  const devUserData =
    typeof process.env.ELECTRON_USER_DATA_DIR === 'string' && process.env.ELECTRON_USER_DATA_DIR.trim().length > 0
      ? path.resolve(process.env.ELECTRON_USER_DATA_DIR.trim())
      : path.join(process.cwd(), '.electron-user-data')
  app.setPath('userData', devUserData)
}

// ===== Single instance guard =====
// dev 模式下如果启动器/重启脚本出现抖动，可能会短时间拉起第二个进程；这里兜底避免“双实例”
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // eslint-disable-next-line no-console
  console.error('[main] requestSingleInstanceLock failed, quitting. userData=', app.getPath('userData'))
  app.quit()
  process.exit(0)
}

function getPreloadPath() {
  // tsup 输出到 dist-electron/preload.cjs
  return path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')
}

function getScreenshotSelectorPreloadPath() {
  return path.join(app.getAppPath(), 'dist-electron', 'screenshotSelectorPreload.cjs')
}

function getScreenshotSelectorHtmlPath() {
  // 开发模式下从 electron/ 目录读取，生产模式下从 dist-electron/ 读取
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist-electron', 'screenshot-selector.html')
  }
  return path.join(app.getAppPath(), 'electron', 'screenshot-selector.html')
}

function getIndexHtmlPath() {
  // vite build 输出到 dist/index.html
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

// ===== Screenshot Selector =====
let screenshotSelectorWindow: BrowserWindow | null = null
let screenshotResolve: ((result: { type: 'region' | 'window' | 'fullscreen'; data: Buffer } | null) => void) | null = null
let screenshotDisplayId: string = ''
let screenshotDisplayBounds: Electron.Rectangle | null = null

function getScreenshotI18n(locale: Locale): Record<string, string> {
  const strings: Record<Locale, Record<string, string>> = {
    'zh-CN': {
      'mode.region': '区域选择',
      'mode.window': '窗口选择',
      'mode.fullscreen': '全屏截图',
      'cancel': '取消',
      'confirm': '确认截图',
      'hint.region': '拖动鼠标选择截图区域，按 Esc 取消',
      'hint.window': '点击选择要截取的窗口',
      'hint.fullscreen': '点击确认截取整个屏幕',
      'loading': '加载中...',
      'window.screen': '屏幕'
    },
    'zh-TW': {
      'mode.region': '區域選擇',
      'mode.window': '視窗選擇',
      'mode.fullscreen': '全螢幕截圖',
      'cancel': '取消',
      'confirm': '確認截圖',
      'hint.region': '拖動滑鼠選擇截圖區域，按 Esc 取消',
      'hint.window': '點擊選擇要截取的視窗',
      'hint.fullscreen': '點擊確認截取整個螢幕',
      'loading': '載入中...',
      'window.screen': '螢幕'
    },
    en: {
      'mode.region': 'Region',
      'mode.window': 'Window',
      'mode.fullscreen': 'Fullscreen',
      'cancel': 'Cancel',
      'confirm': 'Capture',
      'hint.region': 'Drag to select region, press Esc to cancel',
      'hint.window': 'Click to select a window',
      'hint.fullscreen': 'Click to capture fullscreen',
      'loading': 'Loading...',
      'window.screen': 'Screen'
    },
    ja: {
      'mode.region': '範囲選択',
      'mode.window': 'ウィンドウ',
      'mode.fullscreen': '全画面',
      'cancel': 'キャンセル',
      'confirm': 'キャプチャ',
      'hint.region': 'ドラッグして範囲を選択、Escでキャンセル',
      'hint.window': 'クリックしてウィンドウを選択',
      'hint.fullscreen': 'クリックして全画面をキャプチャ',
      'loading': '読み込み中...',
      'window.screen': '画面'
    },
    ko: {
      'mode.region': '영역 선택',
      'mode.window': '창 선택',
      'mode.fullscreen': '전체 화면',
      'cancel': '취소',
      'confirm': '캡처',
      'hint.region': '드래그하여 영역 선택, Esc로 취소',
      'hint.window': '클릭하여 창 선택',
      'hint.fullscreen': '클릭하여 전체 화면 캡처',
      'loading': '로딩 중...',
      'window.screen': '화면'
    }
  }
  return strings[locale] || strings.en
}

async function openScreenshotSelector(): Promise<{ type: 'region' | 'window' | 'fullscreen'; data: Buffer } | null> {
  // 如果已经有选择器窗口打开，先关闭
  if (screenshotSelectorWindow && !screenshotSelectorWindow.isDestroyed()) {
    screenshotSelectorWindow.close()
    screenshotSelectorWindow = null
  }

  // 获取主显示器信息
  const primaryDisplay = screen.getPrimaryDisplay()
  screenshotDisplayId = String(primaryDisplay.id)
  screenshotDisplayBounds = primaryDisplay.bounds

  // 隐藏主窗口
  const wasVisible = mainWindow?.isVisible()
  if (wasVisible) {
    mainWindow?.hide()
  }

  // 等待一小段时间让窗口完全隐藏
  await new Promise(resolve => setTimeout(resolve, 100))

  return new Promise((resolve) => {
    screenshotResolve = resolve

    const i18nStrings = getScreenshotI18n(appSettings.locale)

    screenshotSelectorWindow = new BrowserWindow({
      x: screenshotDisplayBounds!.x,
      y: screenshotDisplayBounds!.y,
      width: screenshotDisplayBounds!.width,
      height: screenshotDisplayBounds!.height,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      // macOS: 不使用 fullscreen/simpleFullscreen，它们会导致黑屏或白屏
      // 改用窗口覆盖整个屏幕 + 高层级 alwaysOnTop 实现类似效果
      fullscreen: !isMac,
      enableLargerThanScreen: isMac,
      visibleOnAllWorkspaces: isMac,
      show: false,
      webPreferences: {
        preload: getScreenshotSelectorPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false // 需要访问 desktopCapturer
      }
    })

    // macOS: 设置高层级的 alwaysOnTop，确保窗口在所有窗口之上（包括菜单栏）
    if (isMac) {
      screenshotSelectorWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    } else {
      screenshotSelectorWindow.setAlwaysOnTop(true, 'floating')
    }

    // 注入 i18n 字符串 - 在 DOM 准备好之前注入
    screenshotSelectorWindow.webContents.on('dom-ready', () => {
      screenshotSelectorWindow?.webContents.executeJavaScript(`
        window.__SCREENSHOT_I18N__ = ${JSON.stringify(i18nStrings)};
        if (window.smScreenshotSelector) {
          window.smScreenshotSelector.i18n = window.__SCREENSHOT_I18N__;
        }
      `)
    })

    screenshotSelectorWindow.once('ready-to-show', () => {
      screenshotSelectorWindow?.show()
      screenshotSelectorWindow?.focus()
    })

    screenshotSelectorWindow.on('closed', () => {
      screenshotSelectorWindow = null
      // 恢复主窗口
      if (wasVisible && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
      }
      // 如果没有收到结果，返回 null
      if (screenshotResolve) {
        screenshotResolve(null)
        screenshotResolve = null
      }
    })

    screenshotSelectorWindow.loadFile(getScreenshotSelectorHtmlPath())
  })
}

function closeScreenshotSelector(result: { type: 'region' | 'window' | 'fullscreen'; data: Buffer } | null) {
  if (screenshotResolve) {
    screenshotResolve(result)
    screenshotResolve = null
  }
  if (screenshotSelectorWindow && !screenshotSelectorWindow.isDestroyed()) {
    screenshotSelectorWindow.close()
    screenshotSelectorWindow = null
  }
}

function sendMenuCommand(win: BrowserWindow | null, cmd: MenuCommand) {
  if (!win) return
  win.webContents.send('menu:command', cmd)
}

// ===== Auto update (GitHub Releases via electron-updater) =====
const GITHUB_OWNER = 'simwy'
const GITHUB_REPO = 'Side-Markdown'

let updateState: UpdateState = {
  status: 'idle',
  // Prefer the real app version as early as possible so the macOS menu doesn't
  // momentarily show "v0.0.0" before auto-updater initialization runs.
  currentVersion: (() => {
    try {
      return app.getVersion()
    } catch {
      return '0.0.0'
    }
  })()
}
let updateInstallRequested = false

function versionLabel(locale: Locale) {
  if (locale === 'en') return 'Version'
  if (locale === 'ja') return 'バージョン'
  if (locale === 'ko') return '버전'
  // zh-CN / zh-TW
  return '版本'
}

function menuLabel(locale: Locale, key: 'file' | 'new' | 'open' | 'save' | 'saveAs' | 'export' | 'closeTab' | 'quit') {
  const dict: Record<Locale, Record<typeof key, string>> = {
    'zh-CN': {
      file: '文件',
      new: '新建',
      open: '打开…',
      save: '保存',
      saveAs: '另存为…',
      export: '导出',
      closeTab: '关闭标签页',
      quit: '退出'
    },
    'zh-TW': {
      file: '檔案',
      new: '新增',
      open: '打開…',
      save: '儲存',
      saveAs: '另存新檔…',
      export: '匯出',
      closeTab: '關閉分頁',
      quit: '退出'
    },
    en: {
      file: 'File',
      new: 'New',
      open: 'Open…',
      save: 'Save',
      saveAs: 'Save As…',
      export: 'Export',
      closeTab: 'Close Tab',
      quit: 'Quit'
    },
    ja: {
      file: 'ファイル',
      new: '新規',
      open: '開く…',
      save: '保存',
      saveAs: '名前を付けて保存…',
      export: 'エクスポート',
      closeTab: 'タブを閉じる',
      quit: '終了'
    },
    ko: {
      file: '파일',
      new: '새로 만들기',
      open: '열기…',
      save: '저장',
      saveAs: '다른 이름으로 저장…',
      export: '내보내기',
      closeTab: '탭 닫기',
      quit: '종료'
    }
  }
  return dict[locale]?.[key] ?? dict.en[key]
}

function isUpdaterEnabled() {
  // electron-updater 仅在“打包后的应用”中可靠工作；dev 模式禁用
  return app.isPackaged
}

function formatError(err: unknown) {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : JSON.stringify(err)
}

function setUpdateState(patch: Partial<UpdateState>) {
  updateState = { ...updateState, ...patch }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:state', updateState)
  }
  syncUpdateMenuState()
}

function expectedUpdateMetaFileForPlatform() {
  if (process.platform === 'darwin') return 'latest-mac.yml'
  if (process.platform === 'win32') return 'latest.yml'
  return null
}

async function preflightGithubReleaseAssets() {
  const need = expectedUpdateMetaFileForPlatform()
  if (!need) return { ok: true as const }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
  try {
    const res = await fetch(apiUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `${APP_TITLE}/${app.getVersion()}`
      }
    })
    if (!res.ok) {
      return { ok: false as const, message: `无法访问 GitHub Releases（HTTP ${res.status}）。` }
    }
    const data = (await res.json()) as { html_url?: string; assets?: Array<{ name?: string }> }
    const assets = Array.isArray(data.assets) ? data.assets : []
    const hasMeta = assets.some((a) => (a?.name ?? '') === need)
    if (!hasMeta) {
      const releaseUrl = data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
      return {
        ok: false as const,
        message: `最新 Release 缺少更新元数据文件：${need}\n\n请用 electron-builder 发布（上传产物时会自动带上该 yml），或手动把它作为 Release asset 上传。\n\n打开：${releaseUrl}`,
        openUrl: releaseUrl
      }
    }
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, message: `检查 GitHub Release 资产失败：${formatError(err)}` }
  }
}

function getUpdateMenuLabel(locale: Locale = appSettings.locale) {
  const currentVersion = updateState.currentVersion && updateState.currentVersion !== '0.0.0' ? updateState.currentVersion : app.getVersion()
  const v = updateState.availableVersion ? ` v${updateState.availableVersion}` : ''
  const hasDot = updateState.status === 'available' || updateState.status === 'downloaded'
  const dot = hasDot ? ' ●' : ''
  // 系统菜单中只展示版本项；当有新版本时在版本号后加红点提示（用 ● 字符）
  return `${versionLabel(locale)} v${currentVersion}${dot}${hasDot ? v : ''}`
}

function syncUpdateMenuState() {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const verItem = menu.getMenuItemById('help.version')
  if (verItem) {
    verItem.label = getUpdateMenuLabel(appSettings.locale)
    verItem.enabled = updateState.status !== 'unsupported'
  }
}

async function checkForUpdates(opts?: { silent?: boolean }) {
  if (!isUpdaterEnabled()) {
    setUpdateState({
      status: 'unsupported',
      currentVersion: app.getVersion(),
      error: 'Auto update is disabled in dev mode.'
    })
    return updateState
  }
  try {
    updateInstallRequested = false
    const pre = await preflightGithubReleaseAssets()
    if (!pre.ok) {
      setUpdateState({ status: 'error', error: pre.message })
      if (!opts?.silent && mainWindow && !mainWindow.isDestroyed()) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: '检查更新失败',
          message: '发布资源不完整，无法自动更新。',
          detail: pre.message,
          buttons: pre.openUrl ? ['打开 Releases', '确定'] : ['确定'],
          defaultId: 0,
          cancelId: pre.openUrl ? 1 : 0
        })
        if (pre.openUrl && response === 0) await shell.openExternal(pre.openUrl)
      }
      return updateState
    }
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setUpdateState({ status: 'error', error: formatError(err) })
    if (!opts?.silent && mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, { type: 'error', title: '检查更新失败', message: '无法检查更新。', detail: formatError(err) })
    }
  }
  return updateState
}

async function startUpdate() {
  if (!isUpdaterEnabled()) {
    setUpdateState({
      status: 'unsupported',
      currentVersion: app.getVersion(),
      error: 'Auto update is disabled in dev mode.'
    })
    if (mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '自动更新不可用',
        message: '当前为开发模式，自动更新仅在发布版（安装包）中可用。'
      })
    }
    return updateState
  }

  // 已下载：直接安装
  if (updateState.status === 'downloaded') {
    updateInstallRequested = true
    autoUpdater.quitAndInstall()
    return updateState
  }

  // 未发现更新时先检查一次
  if (updateState.status !== 'available') {
    await checkForUpdates({ silent: false })
  }

  // 有更新：下载并在下载完成后自动安装
  if (updateState.status === 'available') {
    updateInstallRequested = true
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      updateInstallRequested = false
      setUpdateState({ status: 'error', error: formatError(err) })
      if (mainWindow && !mainWindow.isDestroyed()) {
        void dialog.showMessageBox(mainWindow, { type: 'error', title: '下载更新失败', message: '无法下载更新。', detail: formatError(err) })
      }
    }
  }

  return updateState
}

function initAutoUpdater() {
  setUpdateState({ status: 'idle', currentVersion: app.getVersion(), availableVersion: undefined, error: undefined, progress: undefined })
  if (!isUpdaterEnabled()) {
    setUpdateState({
      status: 'unsupported',
      currentVersion: app.getVersion(),
      error: 'Auto update is disabled in dev mode.'
    })
    return
  }

  // 由“用户点击更新”来触发下载；启动时只做检查并提示红点
  autoUpdater.autoDownload = false

  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking', error: undefined, progress: undefined }))
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    setUpdateState({ status: 'available', availableVersion: info.version, error: undefined, progress: undefined })
  )
  autoUpdater.on('update-not-available', () => setUpdateState({ status: 'not-available', availableVersion: undefined, error: undefined, progress: undefined }))
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    setUpdateState({
      status: 'downloading',
      progress: { percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }
    })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setUpdateState({ status: 'downloaded', availableVersion: info.version, progress: undefined })
    if (updateInstallRequested) {
      autoUpdater.quitAndInstall()
    }
  })
  autoUpdater.on('error', (err) => setUpdateState({ status: 'error', error: formatError(err) }))

  // 启动后后台检查一次（静默）
  setTimeout(() => {
    void checkForUpdates({ silent: true })
  }, 1500)
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

async function openFilePaths(filePaths: string[], opts?: { quiet?: boolean }): Promise<OpenedFile[]> {
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
      if (!opts?.quiet) dialog.showErrorBox('打开失败', `无法打开文件：${p}`)
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
  const locale = appSettings.locale

  const template: Electron.MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
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
          label: menuLabel(locale, 'quit'),
          accelerator: 'Cmd+Q',
          click: () => app.quit()
        }
      ]
    })
  }

  template.push({
    label: menuLabel(locale, 'file'),
    submenu: [
      { label: menuLabel(locale, 'new'), accelerator: accel('Ctrl+N', 'Cmd+N'), click: () => sendMenuCommand(winGetter(), { type: 'file:new' }) },
      { label: menuLabel(locale, 'open'), accelerator: accel('Ctrl+O', 'Cmd+O'), click: () => sendMenuCommand(winGetter(), { type: 'file:open' }) },
      { type: 'separator' },
      { label: menuLabel(locale, 'save'), accelerator: accel('Ctrl+S', 'Cmd+S'), click: () => sendMenuCommand(winGetter(), { type: 'file:save' }) },
      { label: menuLabel(locale, 'saveAs'), accelerator: accel('Ctrl+Shift+S', 'Cmd+Shift+S'), click: () => sendMenuCommand(winGetter(), { type: 'file:saveAs' }) },
      { type: 'separator' },
      {
        label: menuLabel(locale, 'export'),
        submenu: [
          {
            label: 'HTML…',
            accelerator: accel('Ctrl+Alt+H', 'Cmd+Alt+H'),
            click: () => sendMenuCommand(winGetter(), { type: 'file:exportHtml' })
          },
          {
            label: 'PDF…',
            accelerator: accel('Ctrl+Alt+D', 'Cmd+Alt+D'),
            click: () => sendMenuCommand(winGetter(), { type: 'file:exportPdf' })
          },
          {
            label: 'Word（.doc）…',
            accelerator: accel('Ctrl+Alt+W', 'Cmd+Alt+W'),
            click: () => sendMenuCommand(winGetter(), { type: 'file:exportWord' })
          }
        ]
      },
      { type: 'separator' },
      { label: menuLabel(locale, 'closeTab'), accelerator: accel('Ctrl+W', 'Cmd+W'), click: () => sendMenuCommand(winGetter(), { type: 'file:closeTab' }) },
      { type: 'separator' },
      ...(isMac
        ? []
        : [
            {
              label: menuLabel(locale, 'quit'),
              accelerator: 'Ctrl+Q',
              click: () => app.quit()
            }
          ])
    ]
  })

  template.push({
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
  })

  template.push({
    label: '格式',
    submenu: [
      {
        label: '自动换行',
        type: 'checkbox',
        checked: true,
        accelerator: accel('Alt+Z', 'Alt+Z'),
        click: () => sendMenuCommand(winGetter(), { type: 'format:wordWrapToggle' })
      },
      {
        label: '字体…',
        accelerator: accel('Ctrl+Alt+F', 'Cmd+Alt+F'),
        click: () => sendMenuCommand(winGetter(), { type: 'format:font' })
      }
    ]
  })

  template.push({
    label: '视图',
    submenu: [
      {
        label: '状态栏',
        type: 'checkbox',
        checked: true,
        accelerator: accel('Ctrl+Alt+B', 'Cmd+Alt+B'),
        click: () => sendMenuCommand(winGetter(), { type: 'view:statusBarToggle' })
      },
      { type: 'separator' },
      { label: 'Markdown 预览模式（编辑/预览/分栏）', accelerator: accel('Ctrl+P', 'Cmd+P'), click: () => sendMenuCommand(winGetter(), { type: 'view:togglePreviewMode' }) },
      { type: 'separator' },
      {
        label: '切换开发者工具',
        accelerator: accel('Ctrl+Shift+I', 'Alt+Cmd+I'),
        click: () => winGetter()?.webContents.toggleDevTools()
      }
    ]
  })

  template.push({
    label: '编码',
    submenu: [
      {
        label: 'UTF-8',
        accelerator: accel('Ctrl+Alt+1', 'Cmd+Alt+1'),
        click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'utf8' })
      },
      {
        label: 'UTF-16LE',
        accelerator: accel('Ctrl+Alt+2', 'Cmd+Alt+2'),
        click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'utf16le' })
      },
      { type: 'separator' },
      {
        label: 'GBK',
        accelerator: accel('Ctrl+Alt+3', 'Cmd+Alt+3'),
        click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'gbk' })
      },
      {
        label: 'GB18030',
        accelerator: accel('Ctrl+Alt+4', 'Cmd+Alt+4'),
        click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'gb18030' })
      },
      { type: 'separator' },
      {
        label: 'ANSI（Windows-1252）',
        accelerator: accel('Ctrl+Alt+5', 'Cmd+Alt+5'),
        click: () => sendMenuCommand(winGetter(), { type: 'encoding:set', encoding: 'windows1252' })
      }
    ]
  })

  template.push({
    label: '窗口',
    submenu: [
      { role: 'minimize' },
      isMac ? { role: 'zoom' } : { role: 'togglefullscreen' },
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
              accelerator: 'Alt+F4',
              click: () => winGetter()?.close()
            }
          ])
    ]
  })

  template.push({
    label: '帮助',
    submenu: [
      {
        id: 'help.version',
        label: getUpdateMenuLabel(appSettings.locale),
        accelerator: accel('Ctrl+Shift+U', 'Cmd+Shift+U'),
        click: async () => {
          // 埋点：统计有多少用户会点击“版本”去触发更新动作
          sendMenuCommand(winGetter(), {
            type: 'analytics:version_menu_click',
            locale: appSettings.locale,
            currentVersion: updateState.currentVersion,
            updateStatus: updateState.status,
            availableVersion: updateState.availableVersion
          })
          await startUpdate()
        }
      },
      { type: 'separator' },
      {
        label: '触发埋点',
        accelerator: accel('Ctrl+Alt+T', 'Cmd+Alt+T'),
        click: () => sendMenuCommand(winGetter(), { type: 'analytics:triggerTest' })
      },
      { type: 'separator' },
      {
        label: '项目主页',
        accelerator: accel('Ctrl+Alt+G', 'Cmd+Alt+G'),
        click: async () => {
          await shell.openExternal('https://github.com/simwy/Side-Markdown')
        }
      },
      {
        label: '切换深色/浅色',
        accelerator: accel('Ctrl+L', 'Cmd+L'),
        click: () => {
          // 根据当前实际显示的主题来切换
          const isDark = nativeTheme.shouldUseDarkColors
          const nextTheme: 'light' | 'dark' = isDark ? 'light' : 'dark'
          const next = sanitizeSettings(mergeSettings(appSettings, { theme: nextTheme }))
          applyAppSettings(next)
        }
      }
    ]
  })

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  syncUpdateMenuState()
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

function normalizeArgPath(raw: string, cwd: string) {
  const s = String(raw ?? '').trim().replace(/^"+|"+$/g, '')
  if (!s) return null
  // Ignore flags like --foo
  if (s.startsWith('-')) return null
  // dev server url / file url
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('file://')) return null

  const p = path.isAbsolute(s) ? s : path.resolve(cwd, s)
  const ext = path.extname(p).toLowerCase()
  if (!ASSOCIATED_EXTS.has(ext)) return null
  return p
}

async function openAndSendFilePaths(filePaths: string[]) {
  if (filePaths.length === 0) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingOpenFilePaths.push(...filePaths)
    return
  }
  try {
    const opened = await openFilePaths(filePaths)
    mainWindow.webContents.send('fs:openedFiles', opened)
  } catch {
    // ignore
  }
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

  // Ensure DevTools shortcut works even when menu accelerators don't (frameless window / focus quirks).
  // - macOS: Option+Command+I
  // - Windows/Linux: Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase()
    if (key !== 'i') return

    const macHit = isMac && input.meta && input.alt && !input.control && !input.shift
    const winHit = !isMac && input.control && input.shift && !input.alt && !input.meta
    if (!macHit && !winHit) return

    event.preventDefault()
    mainWindow?.webContents.toggleDevTools()
  })

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

  // 处理 renderer 的 beforeunload 阻止关闭：显示确认对话框
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['离开', '取消'],
      title: '确认退出',
      message: '有未保存的更改，确定要离开吗？',
      defaultId: 0,
      cancelId: 1
    })
    if (choice === 0) {
      // 用户选择"离开"：取消阻止，允许关闭
      event.preventDefault()
    }
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
app.on('second-instance', async (_event, commandLine, workingDirectory) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()

  // Windows/Linux: 双击关联文件时，文件路径会出现在 second-instance 的 commandLine
  const cwd = typeof workingDirectory === 'string' && workingDirectory.length > 0 ? workingDirectory : process.cwd()
  const paths = (Array.isArray(commandLine) ? commandLine : [])
    .map((x) => (typeof x === 'string' ? normalizeArgPath(x, cwd) : null))
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  await openAndSendFilePaths(paths)
})

app.on('window-all-closed', () => {
  // 本应用期望行为：关闭最后一个窗口就完全退出（包含 macOS）
  app.quit()
})

// macOS: Finder “打开方式”/双击关联文件
app.on('open-file', async (event, filePath) => {
  event.preventDefault()
  await openAndSendFilePaths([filePath])
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createMainWindow()
})

app.whenReady().then(async () => {
  // 读取并应用设置（主题/语言/贴边参数）
  appSettings = await readSettings()
  nativeTheme.themeSource = appSettings.theme
  setupAnalyticsRequestTrace()

  // Windows/Linux: 通过文件关联启动时，文件路径一般在 process.argv
  // macOS 主要走 open-file 事件，这里不干扰它
  if (!isMac) {
    const cwd = process.cwd()
    const paths = process.argv
      .map((x) => (typeof x === 'string' ? normalizeArgPath(x, cwd) : null))
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (paths.length > 0) pendingOpenFilePaths.push(...paths)
  }

  // Initialize updater state BEFORE building the menu so the first render uses the real version.
  initAutoUpdater()

  await createMainWindow()

  // ===== Protocols =====
  protocol.registerFileProtocol('smfile', (request, callback) => {
    try {
      // smfile:///absolute/path or smfile://C:/path
      const raw = request.url.replace(/^smfile:\/\//i, '')
      // keep leading slash for posix
      const decoded = decodeURIComponent(raw)
      // Windows drive letter may arrive as "/C:/..."
      const p =
        /^\/[a-zA-Z]:\//.test(decoded) ? decoded.slice(1) : decoded.startsWith('/') ? decoded : decoded.replace(/^\/+/, '')
      callback({ path: p })
    } catch {
      callback({ error: -6 }) // FILE_NOT_FOUND
    }
  })

  // ===== IPC =====
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion()
  })

  ipcMain.handle('fs:openFiles', async () => {
    if (!mainWindow) return []
    return await openFilesWithDialog(mainWindow)
  })

  ipcMain.handle('fs:openFilePaths', async (_evt, filePaths: unknown, opts: unknown) => {
    // 只允许 string[]（来自拖拽/系统传入的路径）
    if (!Array.isArray(filePaths)) return []
    const safe = filePaths.filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (safe.length === 0) return []
    const quiet = !!(opts && typeof opts === 'object' && (opts as { quiet?: unknown }).quiet)
    return await openFilePaths(safe, { quiet })
  })

  ipcMain.handle('session:load', async () => {
    return await readSession()
  })

  ipcMain.handle('session:save', async (_evt, session: SessionState) => {
    await writeSession(session)
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

  // ===== Images =====
  ipcMain.handle('image:pickAndSave', async (_evt, req: ImageImportRequest & { allowMulti?: boolean }) => {
    if (!mainWindow) return null
    if (!req || typeof req !== 'object' || typeof req.docPath !== 'string' || req.docPath.length === 0) return null
    const allowMulti = !!req.allowMulti
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片',
      properties: allowMulti ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (canceled || !filePaths || filePaths.length === 0) return null
    return await importImagePaths({ ...req, filePaths })
  })

  ipcMain.handle('image:importFromPaths', async (_evt, req: ImageImportRequest & { filePaths: unknown }) => {
    if (!req || typeof req !== 'object' || typeof req.docPath !== 'string' || req.docPath.length === 0) return []
    const filePaths = Array.isArray(req.filePaths) ? req.filePaths.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
    if (filePaths.length === 0) return []
    return await importImagePaths({ ...req, filePaths })
  })

  ipcMain.handle(
    'image:saveFromBuffer',
    async (_evt, req: ImageImportRequest & { data: ArrayBuffer; mime?: string; nameHint?: string }) => {
      if (!req || typeof req !== 'object' || typeof req.docPath !== 'string' || req.docPath.length === 0) {
        throw new Error('Invalid image request')
      }
      if (!(req.data instanceof ArrayBuffer)) throw new Error('Invalid image data')
      return await saveBufferAsImage(req)
    }
  )

  ipcMain.handle('image:saveFromClipboard', async (_evt, req: ImageImportRequest & { nameHint?: string }) => {
    if (!req || typeof req !== 'object' || typeof req.docPath !== 'string' || req.docPath.length === 0) return null
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    const png = img.toPNG()
    const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
    return await saveBufferAsImage({ ...req, data: ab, mime: 'image/png', nameHint: req.nameHint || `screenshot-${tsName()}` })
  })

  ipcMain.handle('screenshot:captureAndSave', async (_evt, req: ImageImportRequest & { nameHint?: string }) => {
    if (!req || typeof req !== 'object' || typeof req.docPath !== 'string' || req.docPath.length === 0) return null

    try {
      // 先尝试调用 desktopCapturer.getSources() 触发系统权限请求
      const primary = screen.getPrimaryDisplay()
      const size = primary.size
      await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: size.width, height: size.height }
      })

      // macOS: 检查权限状态
      if (isMac) {
        const status = systemPreferences.getMediaAccessStatus('screen')
        if (status !== 'granted') {
          const locale = appSettings.locale
          const messages: Record<Locale, { title: string; message: string; detail: string; open: string; cancel: string }> = {
            'zh-CN': {
              title: '需要屏幕录制权限',
              message: '截图功能需要屏幕录制权限才能工作。',
              detail: '请在"系统设置 → 隐私与安全性 → 屏幕录制"中找到本应用并打开开关，然后重试。',
              open: '打开系统设置',
              cancel: '取消'
            },
            'zh-TW': {
              title: '需要螢幕錄製權限',
              message: '截圖功能需要螢幕錄製權限才能運作。',
              detail: '請在「系統設定 → 隱私權與安全性 → 螢幕錄製」中找到本應用程式並打開開關，然後重試。',
              open: '打開系統設定',
              cancel: '取消'
            },
            en: {
              title: 'Screen Recording Permission Required',
              message: 'Screenshot feature requires screen recording permission.',
              detail: 'Please find this app in "System Settings → Privacy & Security → Screen Recording" and turn on the switch, then try again.',
              open: 'Open System Settings',
              cancel: 'Cancel'
            },
            ja: {
              title: '画面収録の許可が必要です',
              message: 'スクリーンショット機能には画面収録の許可が必要です。',
              detail: '「システム設定 → プライバシーとセキュリティ → 画面収録」でこのアプリを見つけてスイッチをオンにしてから、もう一度お試しください。',
              open: 'システム設定を開く',
              cancel: 'キャンセル'
            },
            ko: {
              title: '화면 녹화 권한 필요',
              message: '스크린샷 기능을 사용하려면 화면 녹화 권한이 필요합니다.',
              detail: '"시스템 설정 → 개인 정보 보호 및 보안 → 화면 녹화"에서 이 앱을 찾아 스위치를 켜고 다시 시도해 주세요.',
              open: '시스템 설정 열기',
              cancel: '취소'
            }
          }
          const msg = messages[locale] || messages.en
          const win = BrowserWindow.fromWebContents(_evt.sender)
          const result = await dialog.showMessageBox(win ?? mainWindow!, {
            type: 'warning',
            title: msg.title,
            message: msg.message,
            detail: msg.detail,
            buttons: [msg.open, msg.cancel],
            defaultId: 0,
            cancelId: 1
          })
          if (result.response === 0) {
            shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
          }
          return null
        }
      }

      // 打开截图选择器
      const result = await openScreenshotSelector()
      if (!result) return null

      const ab = result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength)
      return await saveBufferAsImage({ ...req, data: ab, mime: 'image/png', nameHint: req.nameHint || `screenshot-${tsName()}.png` })
    } catch {
      return null
    }
  })

  // ===== Screenshot Selector IPC handlers =====
  ipcMain.handle('screenshot-selector:getDisplayInfo', async () => {
    const display = screen.getPrimaryDisplay()
    return {
      width: display.size.width,
      height: display.size.height,
      scaleFactor: display.scaleFactor
    }
  })

  ipcMain.handle('screenshot-selector:captureRegion', async (_evt, rect: { x: number; y: number; width: number; height: number }) => {
    try {
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.size
      
      // 获取全屏截图
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      })
      
      const source = sources[0]
      if (!source) {
        closeScreenshotSelector(null)
        return
      }
      
      // 裁剪区域
      const fullImage = source.thumbnail
      const cropped = fullImage.crop({
        x: Math.max(0, Math.round(rect.x)),
        y: Math.max(0, Math.round(rect.y)),
        width: Math.min(rect.width, width - rect.x),
        height: Math.min(rect.height, height - rect.y)
      })
      
      const png = cropped.toPNG()
      closeScreenshotSelector({ type: 'region', data: png })
    } catch (err) {
      console.error('captureRegion error:', err)
      closeScreenshotSelector(null)
    }
  })

  ipcMain.handle('screenshot-selector:captureWindow', async (_evt, sourceId: string) => {
    try {
      // 获取指定窗口的高质量截图
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      
      const source = sources.find(s => s.id === sourceId)
      if (!source) {
        closeScreenshotSelector(null)
        return
      }
      
      const png = source.thumbnail.toPNG()
      closeScreenshotSelector({ type: 'window', data: png })
    } catch (err) {
      console.error('captureWindow error:', err)
      closeScreenshotSelector(null)
    }
  })

  ipcMain.handle('screenshot-selector:captureFullscreen', async () => {
    try {
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.size
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      })
      
      const source = sources[0]
      if (!source) {
        closeScreenshotSelector(null)
        return
      }
      
      const png = source.thumbnail.toPNG()
      closeScreenshotSelector({ type: 'fullscreen', data: png })
    } catch (err) {
      console.error('captureFullscreen error:', err)
      closeScreenshotSelector(null)
    }
  })

  ipcMain.handle('screenshot-selector:cancel', async () => {
    closeScreenshotSelector(null)
  })

  ipcMain.handle('app:quit', async () => {
    app.quit()
  })

  // ===== Auto update =====
  ipcMain.handle('update:getState', async () => {
    return updateState
  })

  ipcMain.handle('update:check', async () => {
    return await checkForUpdates({ silent: false })
  })

  ipcMain.handle('update:start', async () => {
    return await startUpdate()
  })

  ipcMain.handle('update:quitAndInstall', async () => {
    updateInstallRequested = true
    autoUpdater.quitAndInstall()
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
    const prevLocale = appSettings.locale
    const next = sanitizeSettings(mergeSettings(appSettings, patch))
    appSettings = next
    nativeTheme.themeSource = next.theme

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0f17' : '#ffffff')
      mainWindow.webContents.send('settings:changed', next)
    }

    // locale 变化时刷新系统菜单（包含“另存为…”等文案）
    if (prevLocale !== next.locale) {
      buildAppMenu(() => mainWindow)
    }

    await writeSettings(next)
    return next
  })
})


