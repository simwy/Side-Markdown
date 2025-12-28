import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  }
})

export function renderMarkdownToSafeHtml(md: string): string {
  const raw = marked.parse(md) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}


