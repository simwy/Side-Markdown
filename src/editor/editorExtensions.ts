import { EditorView } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { searchKeymap, search } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'

export function buildEditorExtensions(args: {
  kind: 'text' | 'markdown'
  wordWrap: boolean
}): Extension[] {
  const exts: Extension[] = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    search(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.theme({
      '&': {
        height: '100%',
        backgroundColor: 'var(--editorBg)',
        color: 'var(--editorFg)'
      },
      '.cm-scroller': {
        height: '100%',
        overflow: 'auto'
      },
      '.cm-content': {
        fontFamily: 'var(--editorFont)',
        fontSize: 'var(--editorFontSize)',
        fontWeight: 'var(--editorFontWeight)',
        fontStyle: 'var(--editorFontStyle)',
        lineHeight: '1.55',
        // Native caret (when not using drawSelection): make it theme-aware.
        caretColor: 'var(--editorCursor)'
      },
      '.cm-gutters': {
        backgroundColor: 'var(--editorGutterBg)',
        color: 'var(--editorGutterFg)',
        borderRight: '1px solid var(--border)'
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--editorActiveLine)'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--editorActiveLine)'
      },
      '.cm-selectionBackground': {
        backgroundColor: 'var(--editorSelection)'
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--editorCursor)'
      },
      '.cm-dropCursor': {
        borderLeftColor: 'var(--editorCursor)'
      }
    })
  ]

  if (args.wordWrap) exts.push(EditorView.lineWrapping)
  if (args.kind === 'markdown') exts.push(markdown())

  return exts
}


