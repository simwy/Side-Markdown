import React from 'react'
import type { EditorView } from '@codemirror/view'
import { IconBold, IconCodeBlock, IconItalic, IconLink, IconList } from './icons/MarkdownIcons'

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

export function MarkdownToolbar(props: {
  view: EditorView | null
  layout?: 'horizontal' | 'vertical'
  variant?: 'text' | 'icon'
}) {
  const view = props.view
  const layout = props.layout ?? 'horizontal'
  const variant = props.variant ?? 'text'

  const btnClass = variant === 'icon' ? 'icon-btn md-tool-btn' : 'btn'

  return (
    <div className={`toolbar md-toolbar ${layout === 'vertical' ? 'vertical' : ''} ${variant === 'icon' ? 'icon' : ''}`}>
      <button
        className={btnClass}
        disabled={!view}
        title="加粗"
        aria-label="加粗"
        onClick={() => view && wrapSelection(view, '**', '**')}
      >
        {variant === 'icon' ? <IconBold /> : '加粗'}
      </button>
      <button
        className={btnClass}
        disabled={!view}
        title="斜体"
        aria-label="斜体"
        onClick={() => view && wrapSelection(view, '*', '*')}
      >
        {variant === 'icon' ? <IconItalic /> : '斜体'}
      </button>
      <button
        className={btnClass}
        disabled={!view}
        title="列表"
        aria-label="列表"
        onClick={() => view && insertAtCursor(view, '\n- ')}
      >
        {variant === 'icon' ? <IconList /> : '列表'}
      </button>
      <button
        className={btnClass}
        disabled={!view}
        title="链接"
        aria-label="链接"
        onClick={() => view && wrapSelection(view, '[', '](https://)')}
      >
        {variant === 'icon' ? <IconLink /> : '链接'}
      </button>
      <button
        className={btnClass}
        disabled={!view}
        title="代码块"
        aria-label="代码块"
        onClick={() => view && insertAtCursor(view, '\n```\n\n```\n')}
      >
        {variant === 'icon' ? <IconCodeBlock /> : '代码块'}
      </button>
    </div>
  )
}


