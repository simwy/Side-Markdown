import React, { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { EditorView } from '@codemirror/view'
import { buildEditorExtensions } from '../editor/editorExtensions'

export function EditorPane(props: {
  kind: 'text' | 'markdown'
  value: string
  wordWrap: boolean
  onChange: (next: string) => void
  onViewReady: (view: EditorView | null) => void
}) {
  const extensions = useMemo(
    () => buildEditorExtensions({ kind: props.kind, wordWrap: props.wordWrap }),
    [props.kind, props.wordWrap]
  )

  return (
    <CodeMirror
      value={props.value}
      height="100%"
      basicSetup={false}
      extensions={extensions}
      onChange={(val) => props.onChange(val)}
      onCreateEditor={(view) => props.onViewReady(view)}
    />
  )
}


