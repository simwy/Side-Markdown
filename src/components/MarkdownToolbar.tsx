import React from 'react'
import type { EditorView } from '@codemirror/view'

function wrapSelection(view: EditorView, left: string, right: string) {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: `${left}${selected}${right}` },
    selection: { anchor: from + left.length, head: from + left.length + selected.length }
  })
  view.focus()
}

function insertAtCursor(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  view.focus()
}

export function MarkdownToolbar(props: { view: EditorView | null }) {
  const view = props.view
  return (
    <div className="toolbar">
      <button className="btn" disabled={!view} onClick={() => view && wrapSelection(view, '**', '**')}>
        加粗
      </button>
      <button className="btn" disabled={!view} onClick={() => view && wrapSelection(view, '*', '*')}>
        斜体
      </button>
      <button className="btn" disabled={!view} onClick={() => view && insertAtCursor(view, '\n- ')}>
        列表
      </button>
      <button className="btn" disabled={!view} onClick={() => view && wrapSelection(view, '[', '](https://)')}>
        链接
      </button>
      <button className="btn" disabled={!view} onClick={() => view && insertAtCursor(view, '\n```\n\n```\n')}>
        代码块
      </button>
    </div>
  )
}


