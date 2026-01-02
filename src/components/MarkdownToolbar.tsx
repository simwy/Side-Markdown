import React from 'react'
import type { EditorView } from '@codemirror/view'
import type { Locale } from '../../electron/shared'
import { t, type I18nKey } from '../i18n'
import {
  IconBold,
  IconCodeBlock,
  IconHeading,
  IconHr,
  IconImage,
  IconInlineCode,
  IconItalic,
  IconLink,
  IconList,
  IconOrderedList,
  IconQuote,
  IconStrikethrough,
  IconTable,
  IconTaskList
} from './icons/MarkdownIcons'

function wrapSelection(view: EditorView, left: string, right: string) {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: `${left}${selected}${right}` },
    selection: { anchor: from + left.length, head: from + left.length + selected.length }
  })
  view.focus()
}

function wrapSelectionOrInsert(view: EditorView, left: string, right: string, placeholder: string) {
  const { from, to } = view.state.selection.main
  if (from === to) {
    const insert = `${left}${placeholder}${right}`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + left.length, head: from + left.length + placeholder.length }
    })
    view.focus()
    return
  }
  wrapSelection(view, left, right)
}

function insertAtCursor(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  view.focus()
}

function insertSnippet(view: EditorView, text: string, cursorOffset: number) {
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + cursorOffset } })
  view.focus()
}

function lineRangeForSelection(view: EditorView) {
  const doc = view.state.doc
  const { from, to } = view.state.selection.main
  let start = doc.lineAt(from).number
  let end = doc.lineAt(to).number
  // If selection ends exactly at start of a line, don't include that line (unless it's a cursor)
  if (to !== from && to === doc.line(end).from) end = Math.max(start, end - 1)
  return { start, end }
}

function prefixSelectedLines(view: EditorView, prefixer: (i: number) => string) {
  const doc = view.state.doc
  const { start, end } = lineRangeForSelection(view)
  const changes: { from: number; insert: string }[] = []
  let i = 0
  for (let n = start; n <= end; n++) {
    const line = doc.line(n)
    changes.push({ from: line.from, insert: prefixer(i) })
    i++
  }
  if (changes.length) view.dispatch({ changes })
  view.focus()
}

export function MarkdownToolbar(props: {
  view: EditorView | null
  locale: Locale
  layout?: 'horizontal' | 'vertical'
  variant?: 'text' | 'icon'
}) {
  const view = props.view
  const locale = props.locale
  const layout = props.layout ?? 'horizontal'
  const variant = props.variant ?? 'text'

  const btnClass = variant === 'icon' ? 'icon-btn md-tool-btn' : 'btn'

  const tools: Array<{
    key: I18nKey
    icon: React.ReactNode
    run: (v: EditorView) => void
  }> = [
    { key: 'md.heading', icon: <IconHeading />, run: (v) => prefixSelectedLines(v, () => '# ') },
    { key: 'md.bold', icon: <IconBold />, run: (v) => wrapSelectionOrInsert(v, '**', '**', 'text') },
    { key: 'md.italic', icon: <IconItalic />, run: (v) => wrapSelectionOrInsert(v, '*', '*', 'text') },
    { key: 'md.strike', icon: <IconStrikethrough />, run: (v) => wrapSelectionOrInsert(v, '~~', '~~', 'text') },
    { key: 'md.inlineCode', icon: <IconInlineCode />, run: (v) => wrapSelectionOrInsert(v, '`', '`', 'code') },
    {
      key: 'md.codeBlock',
      icon: <IconCodeBlock />,
      run: (v) => insertSnippet(v, '\n```\n\n```\n', '\n```\n'.length)
    },
    { key: 'md.quote', icon: <IconQuote />, run: (v) => prefixSelectedLines(v, () => '> ') },
    { key: 'md.ul', icon: <IconList />, run: (v) => prefixSelectedLines(v, () => '- ') },
    { key: 'md.ol', icon: <IconOrderedList />, run: (v) => prefixSelectedLines(v, (i) => `${i + 1}. `) },
    { key: 'md.task', icon: <IconTaskList />, run: (v) => prefixSelectedLines(v, () => '- [ ] ') },
    { key: 'md.link', icon: <IconLink />, run: (v) => wrapSelectionOrInsert(v, '[', '](https://)', 'text') },
    { key: 'md.image', icon: <IconImage />, run: (v) => wrapSelectionOrInsert(v, '![', '](https://)', 'alt') },
    {
      key: 'md.table',
      icon: <IconTable />,
      run: (v) => insertAtCursor(v, '\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n')
    },
    { key: 'md.hr', icon: <IconHr />, run: (v) => insertAtCursor(v, '\n---\n') }
  ]

  return (
    <div className={`toolbar md-toolbar ${layout === 'vertical' ? 'vertical' : ''} ${variant === 'icon' ? 'icon' : ''}`}>
      {tools.map((tool) => {
        const label = t(locale, tool.key)
        return (
          <button
            key={tool.key}
            className={btnClass}
            disabled={!view}
            title={label}
            aria-label={label}
            onClick={() => view && tool.run(view)}
          >
            {variant === 'icon' ? tool.icon : label}
          </button>
        )
      })}
    </div>
  )
}


