import React, { useEffect, useMemo, useRef } from 'react'
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

  const viewRef = useRef<EditorView | null>(null)
  useEffect(() => {
    return () => {
      viewRef.current = null
      props.onViewReady(null)
    }
  }, [props.onViewReady])

  return (
    <CodeMirror
      className="editor-pane"
      value={props.value}
      height="100%"
      width="100%"
      theme="none"
      style={{ height: '100%' }}
      basicSetup={false}
      extensions={extensions}
      onChange={(val) => props.onChange(val)}
      onCreateEditor={(view) => {
        viewRef.current = view
        props.onViewReady(view)
      }}
    />
  )
}


