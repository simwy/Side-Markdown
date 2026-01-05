import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

function isProbablyUrl(s: string) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)
}

function dirnameOfFilePath(p: string | undefined) {
  if (!p) return null
  const s = String(p)
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  if (i <= 0) return null
  return s.slice(0, i)
}

function joinPath(dir: string, rel: string) {
  const d = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const r = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  return `${d}/${r}`
}

function absPathToSmfileUrl(absPath: string) {
  const p = absPath.replace(/\\/g, '/')
  // Keep as path component; protocol handler will decode.
  if (/^[a-zA-Z]:\//.test(p)) return `smfile:///${encodeURI(p)}`
  if (p.startsWith('/')) return `smfile://${encodeURI(p)}`
  return `smfile:///${encodeURI(p)}`
}

function resolveImageHref(href: string, baseDir: string | null) {
  const raw = String(href || '').trim()
  if (!raw) return raw
  // Already an url (http/file/data/smfile/...) or anchor/mailto etc.
  if (isProbablyUrl(raw)) return raw
  // Absolute filesystem path (mac/linux)
  if (raw.startsWith('/')) return absPathToSmfileUrl(raw)
  // Windows drive path
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return absPathToSmfileUrl(raw)
  if (!baseDir) return raw
  return absPathToSmfileUrl(joinPath(baseDir, raw))
}

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const highlighted =
    lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : hljs.highlightAuto(text).value
  const classAttr = lang ? `hljs language-${lang}` : 'hljs'
  return `<pre><code class="${classAttr}">${highlighted}</code></pre>\n`
}

renderer.image = ({ href, title, text }: { href: string; title?: string | null; text?: string | null }) => {
  const baseDir = dirnameOfFilePath((renderer as unknown as { _smBasePath?: string })._smBasePath)
  const fixed = resolveImageHref(href, baseDir)
  const alt = text ? String(text) : ''
  const t = title ? String(title) : null
  const titleAttr = t ? ` title="${t.replaceAll('"', '&quot;')}"` : ''
  return `<img src="${fixed.replaceAll('"', '&quot;')}" alt="${alt.replaceAll('"', '&quot;')}"${titleAttr} />`
}

marked.setOptions({ gfm: true, breaks: true, renderer })

export function renderMarkdownToSafeHtml(md: string, opts?: { basePath?: string }): string {
  ;(renderer as unknown as { _smBasePath?: string })._smBasePath = opts?.basePath
  const raw = marked.parse(md) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    // Allow our internal local-file protocol + data: for embedded images.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|smfile|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })
}


