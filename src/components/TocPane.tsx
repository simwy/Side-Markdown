import React, { useEffect, useMemo, useState } from 'react'
import type { Locale } from '../../electron/shared'
import { t } from '../i18n'

export type TocItem = {
  depth: number
  text: string
  // 用于在预览 DOM 里定位（同 depth+text 的第 n 次出现）
  ordinal: number
  // 1-based 行号（用于 Editor 跳转）
  line1: number
}

type TocNode = TocItem & {
  children: TocNode[]
}

function extractHeadings(md: string): TocItem[] {
  const lines = md.split(/\r?\n/)
  const items: TocItem[] = []
  const seen = new Map<string, number>()

  let inFence = false
  let fence: '```' | '~~~' | null = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!
    const line = rawLine.replace(/\t/g, '    ')
    const fenceMatch = line.match(/^\s*(```|~~~)/)
    if (fenceMatch) {
      const f = fenceMatch[1] as '```' | '~~~'
      if (!inFence) {
        inFence = true
        fence = f
      } else if (fence === f) {
        inFence = false
        fence = null
      }
      continue
    }
    if (inFence) continue

    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!m) continue
    const depth = m[1]!.length
    const text = m[2]!.replace(/\s+#+\s*$/, '').trim()
    if (!text) continue

    const key = `${depth}:${text}`
    const nextOrdinal = (seen.get(key) ?? 0) + 1
    seen.set(key, nextOrdinal)

    items.push({ depth, text, ordinal: nextOrdinal, line1: i + 1 })
  }

  return items
}

function buildTocTree(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []

  for (const it of items) {
    const node: TocNode = { ...it, children: [] }

    // Pop until we find a parent with smaller depth.
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= node.depth) stack.pop()

    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)

    stack.push(node)
  }

  return roots
}

export function TocPane(props: {
  markdown: string
  locale: Locale
  onJump?: (item: TocItem) => void
  showHeader?: boolean
  // Absolute heading depth cap (1-6). If provided, headings deeper than this won't render.
  maxDepth?: number
}) {
  const items = useMemo(() => extractHeadings(props.markdown), [props.markdown])
  const tree = useMemo(() => buildTocTree(items), [items])
  const maxDepth = props.maxDepth ?? Number.POSITIVE_INFINITY

  // Track collapsed headings (keyed by stable line number).
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  useEffect(() => {
    // Markdown structure may shift while editing; reset collapse state to avoid mismatches.
    setCollapsed({})
  }, [props.markdown])

  const renderNodes: (nodes: TocNode[]) => React.ReactNode[] = (nodes) => {
    return nodes.flatMap((node) => {
      if (node.depth > maxDepth) return []
      const hasChildren = node.children.length > 0
      const isCollapsed = collapsed[node.line1] === true

      const row = (
        <button
          key={node.line1}
          className="toc-item"
          style={{ paddingLeft: 10 + (node.depth - 1) * 12 }}
          title={node.text}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          onClick={() => {
            if (hasChildren) {
              setCollapsed((prev) => ({ ...prev, [node.line1]: !isCollapsed }))
            }
            props.onJump?.(node)
          }}
        >
          <span className={hasChildren ? `toc-caret${isCollapsed ? ' collapsed' : ''}` : 'toc-caret leaf'} aria-hidden="true">
            ▾
          </span>
          <span className="toc-item-text">{node.text}</span>
        </button>
      )

      const kids: React.ReactNode[] = hasChildren && !isCollapsed && node.depth < maxDepth ? renderNodes(node.children) : []
      return [row, ...kids]
    })
  }

  return (
    <div className="toc-pane" aria-label={t(props.locale, 'toc.aria')}>
      {props.showHeader === false ? null : <div className="toc-title">{t(props.locale, 'pane.toc')}</div>}
      {items.length === 0 ? (
        <div className="toc-empty">{t(props.locale, 'toc.empty')}</div>
      ) : (
        <div className="toc-items">{renderNodes(tree)}</div>
      )}
    </div>
  )
}

