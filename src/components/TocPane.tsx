import React, { useMemo } from 'react'

export type TocItem = {
  depth: number
  text: string
  // 用于在预览 DOM 里定位（同 depth+text 的第 n 次出现）
  ordinal: number
  // 1-based 行号（用于 Editor 跳转）
  line1: number
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

export function TocPane(props: {
  markdown: string
  onJump?: (item: TocItem) => void
  showHeader?: boolean
}) {
  const items = useMemo(() => extractHeadings(props.markdown), [props.markdown])

  return (
    <div className="toc-pane" aria-label="Markdown 目录">
      {props.showHeader === false ? null : <div className="toc-title">目录</div>}
      {items.length === 0 ? (
        <div className="toc-empty">（未检测到标题）</div>
      ) : (
        <div className="toc-items">
          {items.map((it, idx) => (
            <button
              key={`${it.depth}:${it.text}:${it.ordinal}:${idx}`}
              className="toc-item"
              style={{ paddingLeft: 10 + (it.depth - 1) * 12 }}
              title={it.text}
              onClick={() => props.onJump?.(it)}
            >
              <span className="toc-item-text">{it.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

