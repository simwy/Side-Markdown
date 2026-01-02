import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { undo, redo, selectAll } from '@codemirror/commands'
import type { AppSettings, Locale, MenuCommand } from '../electron/shared'
import type { DocTab, EditorFont, PreviewMode } from './appTypes'
import { EditorPane } from './components/EditorPane'
import { MarkdownToolbar } from './components/MarkdownToolbar'
import { FontDialog } from './components/FontDialog'
import { GotoLineDialog } from './components/GotoLineDialog'
import { FindReplaceDialog } from './components/FindReplaceDialog'
import { WindowControls } from './components/WindowControls'
import { DockButtons } from './components/DockButtons'
import { SettingsDialog } from './components/SettingsDialog'
import { TitlebarDropdown } from './components/TitlebarDropdown'
import { PanelToggleButtons } from './components/PanelToggleButtons'
import { TocPane, type TocItem } from './components/TocPane'
import { renderMarkdownToSafeHtml } from './markdown'
import { t } from './i18n'

function guessKindFromName(name: string): 'text' | 'markdown' {
  const n = name.toLowerCase()
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'markdown'
  return 'text'
}

function createUntitledName(n: number) {
  return `Untitled-${n}.md`
}

function applyFontCssVars(font: EditorFont) {
  document.documentElement.style.setProperty('--editorFont', font.family)
  document.documentElement.style.setProperty('--editorFontSize', `${font.sizePx}px`)
  document.documentElement.style.setProperty('--editorFontWeight', String(font.weight))
  document.documentElement.style.setProperty('--editorFontStyle', font.italic ? 'italic' : 'normal')
}

function formatDateTime() {
  const d = new Date()
  // 贴近 Windows 记事本：本地化字符串即可
  return d.toLocaleString()
}

function escapeHtmlText(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isMacPlatform() {
  return navigator.userAgent.toLowerCase().includes('mac')
}

export function App() {
  const isMac = useMemo(() => isMacPlatform(), [])
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'system',
    locale: 'zh-CN',
    dock: { hideDelayMs: 250, hiddenWidthPx: 10, shownWidthPx: 200 }
  })
  const locale: Locale = settings.locale
  const [showSettings, setShowSettings] = useState(false)
  const [dockMode, setDockMode] = useState<'left' | 'center' | 'right'>('center')
  const [tabs, setTabs] = useState<DocTab[]>(() => [
    {
      id: crypto.randomUUID(),
      name: createUntitledName(1),
      kind: 'markdown',
      encoding: 'utf8',
      content: `##  1
###  1.1
###  1.2

##  2
###  2.1
###  2.2
`,
      dirty: false,
      createdAt: Date.now()
    }
  ])
  const [activeId, setActiveId] = useState<string>(() => tabs[0]!.id)
  const [wordWrap, setWordWrap] = useState(true)
  const [showStatusBar, setShowStatusBar] = useState(true)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('edit')
  const [showToc, setShowToc] = useState(true)
  const [pendingJump, setPendingJump] = useState<TocItem | null>(null)
  const [font, setFont] = useState<EditorFont>({
    family: 'ui-monospace',
    sizePx: 14,
    weight: 400,
    italic: false
  })
  const [showFontDialog, setShowFontDialog] = useState(false)
  const [showGoto, setShowGoto] = useState(false)
  const [findMode, setFindMode] = useState<null | 'find' | 'replace'>(null)
  const [showNoFileDialog, setShowNoFileDialog] = useState(false)

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? tabs[0], [tabs, activeId])
  const editorViewRef = useRef<EditorView | null>(null)
  const saveSessionTimerRef = useRef<number | null>(null)

  const activeIndex = useMemo(() => {
    const idx = tabs.findIndex((t) => t.id === activeId)
    return idx >= 0 ? idx : 0
  }, [tabs, activeId])
  const canGoPrevTab = tabs.length > 0 && activeIndex > 0
  const canGoNextTab = tabs.length > 0 && activeIndex < tabs.length - 1
  const goPrevTab = () => {
    if (!canGoPrevTab) return
    setActiveId(tabs[activeIndex - 1]!.id)
  }
  const goNextTab = () => {
    if (!canGoNextTab) return
    setActiveId(tabs[activeIndex + 1]!.id)
  }

  useEffect(() => {
    applyFontCssVars(font)
  }, [font])

  useEffect(() => {
    // 读取持久化设置（主题/语言/贴边参数）
    void window.electronAPI.getSettings().then((s) => setSettings(s))
    return window.electronAPI.onSettingsChanged((s) => setSettings(s))
  }, [])

  useEffect(() => {
    return window.electronAPI.onWindowDockMode((mode) => setDockMode(mode))
  }, [])

  useEffect(() => {
    // 贴边模式：只显示 editor（不显示目录/预览，也不显示右上角切换按钮）
    if (dockMode !== 'center') {
      setShowToc(false)
      setPendingJump(null)
      setPreviewMode('edit')
    } else {
      // 切回居中模式：默认显示「目录 + editor」
      setShowToc(true)
      setPendingJump(null)
      setPreviewMode('edit')
    }
  }, [dockMode])

  useEffect(() => {
    // theme: light/dark/system -> CSS variables
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  // 防止误退出：还有未保存的 tab 时给确认
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (tabs.some((t) => t.dirty)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [tabs])

  const ensureActive = (nextTabs: DocTab[], nextActiveId?: string) => {
    setTabs(nextTabs)
    if (nextActiveId) setActiveId(nextActiveId)
    else if (nextTabs.length > 0 && !nextTabs.some((t) => t.id === activeId)) setActiveId(nextTabs[0]!.id)
    else if (nextTabs.length === 0) setActiveId('')
  }

  const newTab = () => {
    const id = crypto.randomUUID()
    setTabs((prev) => {
      const count = prev.filter((t) => t.name.startsWith('Untitled-')).length + 1
      const t: DocTab = {
        id,
        name: createUntitledName(count),
        kind: 'markdown',
        encoding: 'utf8',
        content: `##  1.title
###  1.1.title
###  1.2.title

##  2.title
###  2.1.title
###  2.2.title
`,
        dirty: false,
        createdAt: Date.now()
      }
      return [t, ...prev]
    })
    setActiveId(id)
  }

  const closeTab = (id: string) => {
    const t = tabs.find((x) => x.id === id)
    if (!t) return
    if (t.dirty) {
      const ok = window.confirm(`“${t.name}” 尚未保存，确定关闭吗？`)
      if (!ok) return
    }
    const next = tabs.filter((x) => x.id !== id)
    // 只在关闭“当前激活 tab”时才切换激活项；否则保持原激活（如果仍存在）
    const nextActiveId =
      id === activeId ? next[0]?.id : next.some((x) => x.id === activeId) ? activeId : next[0]?.id
    ensureActive(next, nextActiveId)
  }

  const openFiles = async () => {
    const opened = await window.electronAPI.openFiles()
    if (opened.length === 0) return
    addOpenedFiles(opened)
  }

  const addOpenedFiles = useCallback((opened: Array<{ path?: string; name: string; encoding: DocTab['encoding']; content: string }>) => {
    setTabs((prev) => {
      const next = [...prev]
      let focusId: string | undefined
      for (const f of opened) {
        if (f.path) {
          const existing = next.find((t) => t.path === f.path)
          if (existing) {
            focusId = existing.id
            continue
          }
        }
        const tab: DocTab = {
          id: crypto.randomUUID(),
          path: f.path,
          name: f.name,
          kind: guessKindFromName(f.name),
          encoding: f.encoding,
          content: f.content,
          dirty: false,
          createdAt: Date.now()
        }
        next.unshift(tab)
        focusId = tab.id
      }
      if (focusId) setActiveId(focusId)
      return next
    })
  }, [])

  useEffect(() => {
    const isFileDrag = (dt: DataTransfer | null) => {
      if (!dt) return false
      // drop 阶段最可靠：只要 files 有内容就一定是文件拖拽
      if (dt.files && dt.files.length > 0) return true
      if (dt.types?.includes('Files')) return true
      // 有些平台/实现里，dragover 时 dt.files 可能还是空的，但 items 已经能判断
      const items = Array.from(dt.items ?? [])
      return items.some((it) => it.kind === 'file')
    }

    const parseFileUrl = (raw: string) => {
      // 支持拖入诸如 file:///... 的 URI（有些系统/应用会以 uri-list 形式提供）
      // 参考：RFC 8089 / text/uri-list
      const s = raw.trim()
      if (!s) return null
      if (!s.toLowerCase().startsWith('file://')) return null
      try {
        const u = new URL(s)
        return decodeURIComponent(u.pathname)
      } catch {
        return null
      }
    }

    const onDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer
      // 只有“文件拖入”才阻止默认行为；否则保留编辑器的正常拖拽/粘贴体验
      if (!isFileDrag(dt)) return
      e.preventDefault()
      e.stopPropagation()
      // 兜底：某些库会在 capture/bubble 注册 drop 处理，强制截断
      ;(e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      try {
        if (dt) dt.dropEffect = 'copy'
      } catch {
        // ignore
      }
    }

    const onDrop = async (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return

      // 只要是“文件拖拽”，就必须先截断事件，避免编辑器把文件内容插入当前文档
      // 注意：哪怕我们拿不到 path，也要先拦截；后面用 File API 兜底读取内容并新建 Tab
      if (isFileDrag(dt)) {
        e.preventDefault()
        e.stopPropagation()
        ;(e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      }

      const fileList = Array.from(dt.files ?? [])
      const pathsFromFiles = fileList
        .map((f) => (f as unknown as { path?: string }).path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)

      // 兜底：部分场景会以 text/uri-list 提供
      const uriList = dt.getData?.('text/uri-list') ?? ''
      const pathsFromUri = uriList
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => x && !x.startsWith('#'))
        .map(parseFileUrl)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)

      const filePaths = [...pathsFromFiles, ...pathsFromUri]
      // 优先：能拿到真实路径则走主进程（编码识别更准确 & 可保留原路径用于保存）
      if (filePaths.length > 0) {
        const opened = await window.electronAPI.openFilePaths(filePaths)
        if (opened.length === 0) return
        addOpenedFiles(opened)
        return
      }

      // 兜底：某些 sandbox/平台下拿不到 file.path / uri-list，但仍可通过 File API 读取内容
      if (fileList.length === 0) return
      const openedFallback = await Promise.all(
        fileList.map(async (f) => {
          const content = await f.text()
          return { name: f.name || 'Untitled', encoding: 'utf8' as const, content }
        })
      )
      addOpenedFiles(openedFallback)
    }

    // 用 capture 更稳：避免某些控件（如编辑器）先接到 drop 导致页面导航/插入异常
    window.addEventListener('dragenter', onDragOver, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('dragenter', onDragOver, true)
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [addOpenedFiles])

  const saveActive = async (forceSaveAs: boolean) => {
    if (!activeTab) {
      setShowNoFileDialog(true)
      return
    }
    const t = activeTab
    const req = { path: t.path, nameHint: t.name, content: t.content, encoding: t.encoding }
    const res = forceSaveAs ? await window.electronAPI.saveFileAs(req) : await window.electronAPI.saveFile(req)
    if (!res) return
    setTabs((prev) =>
      prev.map((x) =>
        x.id === t.id ? { ...x, path: res.path, name: res.name, dirty: false, kind: guessKindFromName(res.name) } : x
      )
    )
  }

  const html = useMemo(() => {
    if (!activeTab) return ''
    if (activeTab.kind !== 'markdown') return ''
    return renderMarkdownToSafeHtml(activeTab.content)
  }, [activeTab?.kind, activeTab?.content])

  const exportBodyHtml = useMemo(() => {
    if (!activeTab) return ''
    if (activeTab.kind === 'markdown') return html
    // text：用 <pre> 保留换行
    return `<pre>${escapeHtmlText(activeTab.content)}</pre>`
  }, [activeTab?.kind, activeTab?.content, html])

  const exportAs = async (format: 'html' | 'pdf' | 'word') => {
    if (!activeTab) {
      setShowNoFileDialog(true)
      return
    }
    const req = { title: activeTab.name, nameHint: activeTab.name, html: exportBodyHtml }
    if (format === 'html') await window.electronAPI.exportHtml(req)
    if (format === 'pdf') await window.electronAPI.exportPdf(req)
    if (format === 'word') await window.electronAPI.exportWord(req)
  }

  const dispatchToEditor = (fn: (view: EditorView) => void) => {
    const view = editorViewRef.current
    if (!view) return
    fn(view)
    view.focus()
  }

  const handleMenu = (cmd: MenuCommand) => {
    switch (cmd.type) {
      case 'file:new':
        newTab()
        return
      case 'file:open':
        void openFiles()
        return
      case 'file:save':
        void saveActive(false)
        return
      case 'file:saveAs':
        void saveActive(true)
        return
      case 'file:exportHtml':
        void exportAs('html')
        return
      case 'file:exportPdf':
        void exportAs('pdf')
        return
      case 'file:exportWord':
        void exportAs('word')
        return
      case 'file:closeTab':
        if (!activeTab) return
        closeTab(activeTab.id)
        return
      case 'file:quit':
        void window.electronAPI.quit()
        return
      case 'edit:undo':
        dispatchToEditor((v) => undo(v))
        return
      case 'edit:redo':
        dispatchToEditor((v) => redo(v))
        return
      case 'edit:find':
        setFindMode('find')
        return
      case 'edit:replace':
        setFindMode('replace')
        return
      case 'edit:gotoLine':
        setShowGoto(true)
        return
      case 'edit:insertDateTime':
        dispatchToEditor((v) => {
          const { from, to } = v.state.selection.main
          v.dispatch({ changes: { from, to, insert: formatDateTime() } })
        })
        return
      case 'format:wordWrapToggle':
        setWordWrap((x) => !x)
        return
      case 'format:font':
        setShowFontDialog(true)
        return
      case 'view:statusBarToggle':
        setShowStatusBar((x) => !x)
        return
      case 'view:togglePreviewMode':
        setPreviewMode((m) => (m === 'split' ? 'edit' : m === 'edit' ? 'preview' : 'split'))
        return
      case 'encoding:set':
        if (!activeTab) return
        setTabs((prev) => prev.map((x) => (x.id === activeTab.id ? { ...x, encoding: cmd.encoding } : x)))
        return
      case 'window:toggleMaximize':
      case 'window:minimize':
      case 'window:close':
        // frameless 窗口下，这些行为需要我们自己实现（按钮/双击/快捷键会走这里）
        if (cmd.type === 'window:minimize') void window.electronAPI.windowMinimize()
        if (cmd.type === 'window:toggleMaximize') void window.electronAPI.windowToggleMaximize()
        if (cmd.type === 'window:close') void window.electronAPI.windowClose()
        return
      default:
        return
    }
  }

  useEffect(() => {
    return window.electronAPI.onMenuCommand(handleMenu)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabs])

  useEffect(() => {
    return window.electronAPI.onOpenedFiles((files) => addOpenedFiles(files))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===== Session restore: reopen previously opened files on startup =====
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await window.electronAPI.sessionLoad()
      if (cancelled) return
      const paths = Array.from(s.openFilePaths ?? []).filter((p): p is string => typeof p === 'string' && p.length > 0)
      if (paths.length === 0) return

      // 去重，保序
      const seen = new Set<string>()
      const uniq: string[] = []
      for (const p of paths) {
        if (seen.has(p)) continue
        seen.add(p)
        uniq.push(p)
      }

      // 恢复激活文件：让它在最后打开（addOpenedFiles 会 focus 最后一个）
      const active = s.activeFilePath
      const ordered = active && uniq.includes(active) ? [...uniq.filter((p) => p !== active), active] : uniq

      const opened = await window.electronAPI.openFilePaths(ordered, { quiet: true })
      if (cancelled) return
      if (opened.length === 0) return
      addOpenedFiles(opened)
    })()
    return () => {
      cancelled = true
    }
  }, [addOpenedFiles])

  // ===== Session save: persist currently opened file list =====
  useEffect(() => {
    if (saveSessionTimerRef.current) window.clearTimeout(saveSessionTimerRef.current)
    // 轻微防抖：避免输入时每个字符都写一次
    saveSessionTimerRef.current = window.setTimeout(() => {
      saveSessionTimerRef.current = null
      const openFilePaths = tabs
        .map((t) => t.path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
      const activeFilePath =
        typeof activeTab?.path === 'string' && activeTab.path.length > 0 ? activeTab.path : undefined
      void window.electronAPI.sessionSave({ openFilePaths, activeFilePath })
    }, 250)
    return () => {
      if (saveSessionTimerRef.current) window.clearTimeout(saveSessionTimerRef.current)
    }
  }, [tabs, activeTab?.path])

  const selectionInfo = useMemo(() => {
    if (!activeTab) return { line: 1, col: 1, lines: 1 }
    const view = editorViewRef.current
    if (!view) return { line: 1, col: 1, lines: 1 }
    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    return { line: line.number, col: pos - line.from + 1, lines: view.state.doc.lines }
  }, [activeTab?.content])

  const isMarkdown = activeTab?.kind === 'markdown'
  const editorVisible = !!activeTab && (!isMarkdown || previewMode === 'edit' || previewMode === 'split')
  const previewVisible = !!activeTab && !!isMarkdown && (previewMode === 'preview' || previewMode === 'split')

  const applyPreviewMode = (nextEditor: boolean, nextPreview: boolean) => {
    // 防止全关导致空白：至少保留一个面板
    if (!nextEditor && !nextPreview) nextEditor = true
    setPreviewMode(nextEditor && nextPreview ? 'split' : nextEditor ? 'edit' : 'preview')
  }

  const jumpPreviewToHeading = (item: TocItem) => {
    const root = document.querySelector('.preview-pane') as HTMLElement | null
    if (!root) return
    const wantedTag = `H${item.depth}`
    const all = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
    let count = 0
    for (const el of all) {
      if (el.tagName !== wantedTag) continue
      if ((el.textContent ?? '').trim() !== item.text) continue
      count += 1
      if (count === item.ordinal) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' })
        return
      }
    }
  }

  const jumpEditorToLine = (line1: number) => {
    dispatchToEditor((v) => {
      const safe = Math.max(1, Math.min(line1, v.state.doc.lines))
      const line = v.state.doc.line(safe)
      v.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
    })
  }

  const jumpToHeading = (item: TocItem) => {
    // 目录点击：强制让右侧是「编辑器+预览」同时可见，然后两边一起跳转
    if (!isMarkdown) return
    setPendingJump(item)
    if (previewMode !== 'split') setPreviewMode('split')
  }

  useEffect(() => {
    if (!pendingJump) return
    if (!isMarkdown) {
      setPendingJump(null)
      return
    }

    // 等到 split 生效（确保 editor + preview 都存在）
    if (previewMode !== 'split') return

    jumpEditorToLine(pendingJump.line1)

    // 预览 DOM 在切换模式/重新渲染后可能还没就绪：多等一帧更稳
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        jumpPreviewToHeading(pendingJump)
        setPendingJump(null)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, previewMode, isMarkdown, html])

  return (
    <div className="app">
      <div
        className={`topbar ${dockMode !== 'center' ? 'docked' : ''}`}
        onDoubleClick={(e) => {
          // 双击“标题栏空白区域”切换最大化/还原（避免双击 tab/按钮触发）
          const el = e.target as HTMLElement
          if (el.closest('button,input,select,textarea,a,.tab,.no-drag')) return
          void window.electronAPI.windowToggleMaximize()
        }}
      >
        {dockMode !== 'center' ? (
          <>
            <div className="titlebar-row row1">
              <div className="titlebar-left">
                {/* 贴边模式下隐藏窗口控制按钮（最小化/最大化/关闭） */}
                <div className="nav-buttons no-drag" aria-label="Navigation">
                  <button className="icon-btn" title="Back" disabled={!canGoPrevTab} onClick={goPrevTab}>
                    ‹
                  </button>
                  <button className="icon-btn" title="Forward" disabled={!canGoNextTab} onClick={goNextTab}>
                    ›
                  </button>
                </div>
              </div>

              <div className="titlebar-right">
                <DockButtons mode={dockMode} />

                <TitlebarDropdown
                  buttonLabel={t(locale, 'menu')}
                  items={[
                    { label: t(locale, 'new'), onClick: newTab },
                    { label: t(locale, 'open'), onClick: () => void openFiles() },
                    { label: t(locale, 'save'), onClick: () => void saveActive(false) },
                    {
                      label: t(locale, 'export'),
                      children: [
                        { label: t(locale, 'export.html'), onClick: () => void exportAs('html') },
                        { label: t(locale, 'export.pdf'), onClick: () => void exportAs('pdf') },
                        { label: t(locale, 'export.word'), onClick: () => void exportAs('word') }
                      ]
                    },
                    { label: t(locale, 'settings'), onClick: () => setShowSettings(true) },
                    { label: t(locale, 'quit'), onClick: () => void window.electronAPI.quit() }
                  ]}
                />

                {/* 贴边模式下隐藏窗口控制按钮（最小化/最大化/关闭） */}
              </div>
            </div>

            <div className="titlebar-row row2">
              <div className="tabs tabs-row2">
                {tabs.map((t) => (
                  <div
                    key={t.id}
                    className={`tab ${t.id === activeId ? 'active' : ''}`}
                    onMouseDown={() => setActiveId(t.id)}
                    role="button"
                    tabIndex={0}
                  >
                    {t.dirty ? <span className="dirty" title="未保存" /> : null}
                    <span title={t.path ?? t.name}>{t.name}</span>
                    <button
                      aria-label="关闭"
                      title="关闭"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        closeTab(t.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="titlebar-left">
              {isMac ? <WindowControls /> : null}
              <div className="nav-buttons no-drag" aria-label="Navigation">
                <button className="icon-btn" title="Back" disabled={!canGoPrevTab} onClick={goPrevTab}>
                  ‹
                </button>
                <button className="icon-btn" title="Forward" disabled={!canGoNextTab} onClick={goNextTab}>
                  ›
                </button>
              </div>
            </div>

            <div className="titlebar-center">
              <div className="tabs">
                {tabs.map((t) => (
                  <div
                    key={t.id}
                    className={`tab ${t.id === activeId ? 'active' : ''}`}
                    onMouseDown={() => setActiveId(t.id)}
                    role="button"
                    tabIndex={0}
                  >
                    {t.dirty ? <span className="dirty" title="未保存" /> : null}
                    <span title={t.path ?? t.name}>{t.name}</span>
                    <button
                      aria-label="关闭"
                      title="关闭"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        closeTab(t.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="titlebar-right">
              <DockButtons mode={dockMode} />

              <TitlebarDropdown
                buttonLabel={t(locale, 'menu')}
                items={[
                  { label: t(locale, 'new'), onClick: newTab },
                  { label: t(locale, 'open'), onClick: () => void openFiles() },
                  { label: t(locale, 'save'), onClick: () => void saveActive(false) },
                  {
                    label: t(locale, 'export'),
                    children: [
                      { label: t(locale, 'export.html'), onClick: () => void exportAs('html') },
                      { label: t(locale, 'export.pdf'), onClick: () => void exportAs('pdf') },
                      { label: t(locale, 'export.word'), onClick: () => void exportAs('word') }
                    ]
                  },
                  { label: t(locale, 'settings'), onClick: () => setShowSettings(true) },
                  { label: t(locale, 'quit'), onClick: () => void window.electronAPI.quit() }
                ]}
              />

              {!isMac ? <WindowControls /> : null}
            </div>
          </>
        )}
      </div>

      <div className="content">
        {!activeTab ? (
          <div
            className="empty-state"
            role="button"
            tabIndex={0}
            onMouseDown={() => setShowNoFileDialog(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShowNoFileDialog(true)
            }}
          >
            <div className="empty-state-card">
              <div className="empty-state-title">{t(locale, 'noFile.title')}</div>
              <div className="empty-state-desc">{t(locale, 'noFile.desc')}</div>
            </div>
          </div>
        ) : dockMode === 'center' ? (
          <>
            <PanelToggleButtons
              kind={activeTab.kind}
              tocVisible={isMarkdown && showToc}
              editorVisible={editorVisible}
              previewVisible={previewVisible}
              onToggleToc={() => {
                if (!isMarkdown) return
                setShowToc((x) => !x)
              }}
              onToggleEditor={() => {
                if (!isMarkdown) return
                applyPreviewMode(!editorVisible, previewVisible)
              }}
              onTogglePreview={() => {
                if (!isMarkdown) return
                applyPreviewMode(editorVisible, !previewVisible)
              }}
            />

            {(() => {
              const panes: React.ReactNode[] = []

              if (isMarkdown && showToc) {
                panes.push(
                  <div key="toc" className="pane readonly" data-pane="toc">
                    <div className="pane-header">
                      <div className="pane-title">目录</div>
                      <div className="pane-badges">
                        <span className="pane-badge readonly" title="该区域不可编辑，可点击跳转">只读</span>
                      </div>
                    </div>
                    <div className="pane-body">
                      <TocPane markdown={activeTab.content} onJump={jumpToHeading} showHeader={false} />
                    </div>
                  </div>
                )
              }

              if (editorVisible) {
                panes.push(
                  <div key="editor" className="pane editable" data-pane="editor">
                    <div className="pane-header">
                      <div className="pane-title">编辑器</div>
                      <div className="pane-badges">
                        <span className="pane-badge editable" title="该区域可编辑">可编辑</span>
                      </div>
                    </div>
                    <div className="pane-body">
                    <div className="editor-shell">
                      {isMarkdown ? (
                        <div className="editor-side-toolbar">
                          <MarkdownToolbar view={editorViewRef.current} locale={locale} layout="vertical" variant="icon" />
                        </div>
                      ) : null}
                      <div className="editor-host">
                        <EditorPane
                          kind={activeTab.kind}
                          value={activeTab.content}
                          wordWrap={wordWrap}
                          onViewReady={(v) => (editorViewRef.current = v)}
                          onChange={(next) =>
                            setTabs((prev) =>
                              prev.map((x) => (x.id === activeTab.id ? { ...x, content: next, dirty: true } : x))
                            )
                          }
                        />
                      </div>
                    </div>
                    </div>
                  </div>
                )
              }

              if (previewVisible) {
                panes.push(
                  <div key="preview" className="pane readonly" data-pane="preview">
                    <div className="pane-header">
                      <div className="pane-title">预览</div>
                      <div className="pane-badges">
                        <span className="pane-badge readonly" title="该区域不可编辑（用于阅读预览）">只读</span>
                      </div>
                    </div>
                    <div className="pane-body">
                      <div className="preview preview-pane" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  </div>
                )
              }

              // grid columns: TOC 固定宽度，其余等分
              const template = panes.map((_, i) => (isMarkdown && showToc && i === 0 ? '240px' : '1fr')).join(' ')

              return (
                <div className="split" style={{ gridTemplateColumns: template }}>
                  {panes}
                </div>
              )
            })()}
          </>
        ) : (
          // 贴边模式：只显示 editor
          <div className="pane">
            <div className="editor-shell">
              <div className="editor-host">
                <EditorPane
                  kind={activeTab.kind}
                  value={activeTab.content}
                  wordWrap={wordWrap}
                  onViewReady={(v) => (editorViewRef.current = v)}
                  onChange={(next) =>
                    setTabs((prev) =>
                      prev.map((x) => (x.id === activeTab.id ? { ...x, content: next, dirty: true } : x))
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showStatusBar ? (
        <div className="statusbar">
          <div className="kvs">
            <span className="kv">
              <b>Ln</b> {selectionInfo.line}
            </span>
            <span className="kv">
              <b>Col</b> {selectionInfo.col}
            </span>
            <span className="kv">
              <b>Lines</b> {selectionInfo.lines}
            </span>
          </div>
          <div className="kvs">
            <span className="kv">
              <b>Encoding</b> {activeTab?.encoding ?? '-'}
            </span>
            <span className="kv">
              <b>Wrap</b> {wordWrap ? 'On' : 'Off'}
            </span>
            <span className="kv">
              <b>Mode</b> {activeTab ? (activeTab.kind === 'markdown' ? previewMode : 'text') : '-'}
            </span>
          </div>
        </div>
      ) : null}

      {showNoFileDialog ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNoFileDialog(false)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={t(locale, 'noFile.title')}>
            <h3>{t(locale, 'noFile.title')}</h3>
            <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
              {t(locale, 'noFile.prompt')}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowNoFileDialog(false)}>
                {t(locale, 'cancel')}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowNoFileDialog(false)
                  void openFiles()
                }}
              >
                {t(locale, 'noFile.action.openFile')}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowNoFileDialog(false)
                  newTab()
                }}
              >
                {t(locale, 'noFile.action.newFile')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFontDialog ? (
        <FontDialog
          value={font}
          onClose={() => setShowFontDialog(false)}
          onApply={(next) => {
            setFont(next)
            setShowFontDialog(false)
          }}
        />
      ) : null}

      {showGoto ? (
        <GotoLineDialog
          maxLine={selectionInfo.lines}
          onClose={() => setShowGoto(false)}
          onGo={(line1) => {
            setShowGoto(false)
            dispatchToEditor((v) => {
              const line = v.state.doc.line(line1)
              v.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
            })
          }}
        />
      ) : null}

      {findMode ? (
        <FindReplaceDialog
          mode={findMode}
          view={editorViewRef.current}
          onClose={() => setFindMode(null)}
        />
      ) : null}

      {showSettings ? (
        <SettingsDialog
          locale={locale}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onApply={(patch) => {
            void window.electronAPI.updateSettings(patch).then((next) => setSettings(next))
            setShowSettings(false)
          }}
        />
      ) : null}
    </div>
  )
}


