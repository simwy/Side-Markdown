import React, { useMemo, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Modal } from './Modal'

function normalize(text: string, caseSensitive: boolean) {
  return caseSensitive ? text : text.toLowerCase()
}

function findNextIndex(args: {
  doc: string
  query: string
  from: number
  caseSensitive: boolean
}): number {
  const { doc, query, from, caseSensitive } = args
  if (!query) return -1
  const hay = normalize(doc, caseSensitive)
  const needle = normalize(query, caseSensitive)
  return hay.indexOf(needle, from)
}

export function FindReplaceDialog(props: {
  mode: 'find' | 'replace'
  view: EditorView | null
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)

  const canUse = useMemo(() => !!props.view && query.length > 0, [props.view, query])

  const doFindNext = () => {
    const view = props.view
    if (!view || !query) return
    const doc = view.state.doc.toString()
    const start = view.state.selection.main.to
    let idx = findNextIndex({ doc, query, from: start, caseSensitive })
    if (idx === -1) idx = findNextIndex({ doc, query, from: 0, caseSensitive }) // wrap
    if (idx === -1) {
      window.alert('未找到匹配内容。')
      return
    }
    view.dispatch({
      selection: { anchor: idx, head: idx + query.length },
      scrollIntoView: true
    })
    view.focus()
  }

  const doReplace = () => {
    const view = props.view
    if (!view || !query) return
    const sel = view.state.selection.main
    const selected = view.state.doc.sliceString(sel.from, sel.to)
    const match =
      normalize(selected, caseSensitive) === normalize(query, caseSensitive) && selected.length === query.length
    if (match) {
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: replacement },
        selection: { anchor: sel.from, head: sel.from + replacement.length }
      })
    }
    doFindNext()
  }

  const doReplaceAll = () => {
    const view = props.view
    if (!view || !query) return
    const doc = view.state.doc.toString()
    const hay = normalize(doc, caseSensitive)
    const needle = normalize(query, caseSensitive)
    if (!needle) return

    const changes: { from: number; to: number; insert: string }[] = []
    let from = 0
    while (from <= hay.length) {
      const idx = hay.indexOf(needle, from)
      if (idx === -1) break
      changes.push({ from: idx, to: idx + query.length, insert: replacement })
      from = idx + query.length
    }
    if (changes.length === 0) {
      window.alert('未找到匹配内容。')
      return
    }
    view.dispatch({ changes })
    view.focus()
  }

  return (
    <Modal title={props.mode === 'find' ? '查找' : '查找 / 替换'} onClose={props.onClose}>
      <div className="field">
        <label>查找内容</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入要查找的文本" />
      </div>
      {props.mode === 'replace' ? (
        <div className="field">
          <label>替换为</label>
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="输入替换文本" />
        </div>
      ) : null}
      <div className="field">
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> 区分大小写
        </label>
      </div>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={props.onClose}>
          关闭
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={!canUse} onClick={doFindNext}>
            查找下一个
          </button>
          {props.mode === 'replace' ? (
            <>
              <button className="btn" disabled={!canUse} onClick={doReplace}>
                替换
              </button>
              <button className="btn" disabled={!canUse} onClick={doReplaceAll}>
                全部替换
              </button>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}


