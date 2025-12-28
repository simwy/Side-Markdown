import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { undo, redo, selectAll } from '@codemirror/commands'
import type { MenuCommand } from '../electron/shared'
import type { DocTab, EditorFont, PreviewMode } from './appTypes'
import { EditorPane } from './components/EditorPane'
import { MarkdownToolbar } from './components/MarkdownToolbar'
import { FontDialog } from './components/FontDialog'
import { GotoLineDialog } from './components/GotoLineDialog'
import { FindReplaceDialog } from './components/FindReplaceDialog'
import { renderMarkdownToSafeHtml } from './markdown'

function guessKindFromName(name: string): 'text' | 'markdown' {
  const n = name.toLowerCase()
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'markdown'
  return 'text'
}

function createUntitledName(n: number) {
  return `Untitled-${n}.txt`
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

export function App() {
  const [tabs, setTabs] = useState<DocTab[]>(() => [
    {
      id: crypto.randomUUID(),
      name: createUntitledName(1),
      kind: 'text',
      encoding: 'utf8',
      content: '',
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
      kind: 'text',
      encoding: 'utf8',
      content: '',
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
      case 'edit:selectAll':
        dispatchToEditor((v) => selectAll(v))
        return
      case 'edit:cut':
        document.execCommand('cut')
        return
      case 'edit:copy':
        document.execCommand('copy')
        return
      case 'edit:paste':
        document.execCommand('paste')
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
        // 这些由 Electron 自己处理更合适；菜单仍可保留在主进程
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
      <div className="topbar">
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

        {activeTab.kind === 'markdown' ? <MarkdownToolbar view={editorViewRef.current} /> : null}

        <button className="btn" onClick={newTab}>
          新建
        </button>
        <button className="btn" onClick={() => void openFiles()}>
          打开
        </button>
        <button className="btn" onClick={() => void saveActive(false)}>
          保存
        </button>
      </div>

      <div className="content">
        {activeTab.kind === 'markdown' && previewMode === 'split' ? (
          <div className="split">
            <div className="pane">
              <EditorPane
                kind={activeTab.kind}
                value={activeTab.content}
                wordWrap={wordWrap}
                onViewReady={(v) => (editorViewRef.current = v)}
                onChange={(next) =>
                  setTabs((prev) => prev.map((x) => (x.id === activeTab.id ? { ...x, content: next, dirty: true } : x)))
                }
              />
            </div>
            <div className="pane preview" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : showEditor ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <EditorPane
              kind={activeTab.kind}
              value={activeTab.content}
              wordWrap={wordWrap}
              onViewReady={(v) => (editorViewRef.current = v)}
              onChange={(next) =>
                setTabs((prev) => prev.map((x) => (x.id === activeTab.id ? { ...x, content: next, dirty: true } : x)))
              }
            />
          </div>
        ) : (
          <div className="preview" style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: html }} />
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
    </div>
  )
}


