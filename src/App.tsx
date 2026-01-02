import React, { useEffect, useMemo, useRef, useState } from 'react'
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
      content: `## 标题 1
### 标题 1.1
### 标题 1.2

## 标题 2
### 标题 2.1
### 标题 2.2
`,
      dirty: false,
      createdAt: Date.now()
    }
  ])
  const [activeId, setActiveId] = useState<string>(() => tabs[0]!.id)
  const [wordWrap, setWordWrap] = useState(true)
  const [showStatusBar, setShowStatusBar] = useState(true)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split')
  const [font, setFont] = useState<EditorFont>({
    family: 'ui-monospace',
    sizePx: 14,
    weight: 400,
    italic: false
  })
  const [showFontDialog, setShowFontDialog] = useState(false)
  const [showGoto, setShowGoto] = useState(false)
  const [findMode, setFindMode] = useState<null | 'find' | 'replace'>(null)

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? tabs[0]!, [tabs, activeId])
  const editorViewRef = useRef<EditorView | null>(null)

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
  }

  const newTab = () => {
    const count = tabs.filter((t) => t.name.startsWith('Untitled-')).length + 1
    const t: DocTab = {
      id: crypto.randomUUID(),
      name: createUntitledName(count),
      kind: 'markdown',
      encoding: 'utf8',
      content: `## 标题 1
### 标题 1.1
### 标题 1.2

## 标题 2
### 标题 2.1
### 标题 2.2
`,
      dirty: false,
      createdAt: Date.now()
    }
    ensureActive([t, ...tabs], t.id)
  }

  const closeTab = (id: string) => {
    const t = tabs.find((x) => x.id === id)
    if (!t) return
    if (t.dirty) {
      const ok = window.confirm(`“${t.name}” 尚未保存，确定关闭吗？`)
      if (!ok) return
    }
    const next = tabs.filter((x) => x.id !== id)
    ensureActive(next, next[0]?.id)
    if (next.length === 0) {
      // 至少保留一个空白文档，体验更贴近记事本
      newTab()
    }
  }

  const openFiles = async () => {
    const opened = await window.electronAPI.openFiles()
    if (opened.length === 0) return
    addOpenedFiles(opened)
  }

  const addOpenedFiles = (opened: Array<{ path: string; name: string; encoding: DocTab['encoding']; content: string }>) => {
    setTabs((prev) => {
      const next = [...prev]
      let focusId: string | undefined
      for (const f of opened) {
        const existing = next.find((t) => t.path === f.path)
        if (existing) {
          focusId = existing.id
          continue
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
  }

  const saveActive = async (forceSaveAs: boolean) => {
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
      case 'file:closeTab':
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

  const html = useMemo(() => {
    if (activeTab.kind !== 'markdown') return ''
    return renderMarkdownToSafeHtml(activeTab.content)
  }, [activeTab.kind, activeTab.content])

  const selectionInfo = useMemo(() => {
    const view = editorViewRef.current
    if (!view) return { line: 1, col: 1, lines: 1 }
    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    return { line: line.number, col: pos - line.from + 1, lines: view.state.doc.lines }
  }, [activeTab.content])

  const showPreview = activeTab.kind === 'markdown' && (previewMode === 'preview' || previewMode === 'split')
  const showEditor = previewMode === 'edit' || previewMode === 'split' || activeTab.kind !== 'markdown'

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
                  <button className="icon-btn" title="Back" disabled>
                    ‹
                  </button>
                  <button className="icon-btn" title="Forward" disabled>
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
                <button className="icon-btn" title="Back" disabled>
                  ‹
                </button>
                <button className="icon-btn" title="Forward" disabled>
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
              <button className="btn no-drag" onClick={newTab}>
                {t(locale, 'new')}
              </button>
              <button className="btn no-drag" onClick={() => void openFiles()}>
                {t(locale, 'open')}
              </button>
              <button className="btn no-drag" onClick={() => void saveActive(false)}>
                {t(locale, 'save')}
              </button>

              <button className="btn no-drag" onClick={() => setShowSettings(true)}>
                {t(locale, 'settings')}
              </button>

              <DockButtons mode={dockMode} />

              {!isMac ? <WindowControls /> : null}
            </div>
          </>
        )}
      </div>

      <div className="content">
        {activeTab.kind === 'markdown' && previewMode === 'split' ? (
          <div className="split">
            <div className="pane">
              <div className="editor-shell">
                <div className="editor-side-toolbar">
                  <MarkdownToolbar view={editorViewRef.current} layout="vertical" variant="icon" />
                </div>
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
            <div className="pane preview" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : showEditor ? (
          <div className="pane">
            <div className="editor-shell">
              {activeTab.kind === 'markdown' ? (
                <div className="editor-side-toolbar">
                  <MarkdownToolbar view={editorViewRef.current} layout="vertical" variant="icon" />
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
        ) : (
          <div className="pane preview" dangerouslySetInnerHTML={{ __html: html }} />
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
              <b>Encoding</b> {activeTab.encoding}
            </span>
            <span className="kv">
              <b>Wrap</b> {wordWrap ? 'On' : 'Off'}
            </span>
            <span className="kv">
              <b>Mode</b> {activeTab.kind === 'markdown' ? previewMode : 'text'}
            </span>
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


