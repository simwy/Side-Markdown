import React from 'react'
import type { Locale } from '../../electron/shared'
import { t } from '../i18n'
import { IconEditor, IconPreview, IconToc } from './icons/PanelIcons'

export function PanelToggleButtons(props: {
  locale: Locale
  kind: 'text' | 'markdown'
  tocVisible: boolean
  editorVisible: boolean
  previewVisible: boolean
  onToggleToc: () => void
  onToggleEditor: () => void
  onTogglePreview: () => void
}) {
  const isMarkdown = props.kind === 'markdown'

  return (
    <div className="panel-toggle-overlay no-drag" aria-label="Panels">
      <div className="dock-group" role="group" aria-label={t(props.locale, 'panelToggle.group')}>
        <button
          className={`seg-btn ${props.tocVisible ? 'active' : ''}`}
          title={t(props.locale, 'panelToggle.toc')}
          aria-label={t(props.locale, 'panelToggle.toc')}
          aria-pressed={props.tocVisible}
          disabled={!isMarkdown}
          onClick={props.onToggleToc}
        >
          <IconToc size={14} />
        </button>
        <button
          className={`seg-btn ${props.editorVisible ? 'active' : ''}`}
          title={t(props.locale, 'panelToggle.editor')}
          aria-label={t(props.locale, 'panelToggle.editor')}
          aria-pressed={props.editorVisible}
          onClick={props.onToggleEditor}
        >
          <IconEditor size={14} />
        </button>
        <button
          className={`seg-btn ${props.previewVisible ? 'active' : ''}`}
          title={t(props.locale, 'panelToggle.preview')}
          aria-label={t(props.locale, 'panelToggle.preview')}
          aria-pressed={props.previewVisible}
          disabled={!isMarkdown}
          onClick={props.onTogglePreview}
        >
          <IconPreview size={14} />
        </button>
      </div>
    </div>
  )
}

