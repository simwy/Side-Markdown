import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const highlighted =
    lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : hljs.highlightAuto(text).value
  const classAttr = lang ? `hljs language-${lang}` : 'hljs'
  return `<pre><code class="${classAttr}">${highlighted}</code></pre>\n`
}

marked.setOptions({ gfm: true, breaks: true, renderer })

export function renderMarkdownToSafeHtml(md: string): string {
  const raw = marked.parse(md) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}


