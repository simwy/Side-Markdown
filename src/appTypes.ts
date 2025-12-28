import type { EncodingName } from '../electron/shared'

export type DocKind = 'text' | 'markdown'
export type PreviewMode = 'edit' | 'preview' | 'split'

export type DocTab = {
  id: string
  path?: string
  name: string
  kind: DocKind
  encoding: EncodingName
  content: string
  dirty: boolean
  createdAt: number
}

export type EditorFont = {
  family: string
  sizePx: number
  weight: number
  italic: boolean
}


