import React, { useEffect, useMemo, useState } from 'react'
import type { AppSettings, Locale, ThemeMode } from '../../electron/shared'
import { t } from '../i18n'
import { Modal } from './Modal'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function SettingsDialog(props: {
  locale: Locale
  settings: AppSettings
  onClose: () => void
  onApply: (patch: Partial<AppSettings>) => void
}) {
  const [theme, setTheme] = useState<ThemeMode>(props.settings.theme)
  const [lang, setLang] = useState<Locale>(props.settings.locale)
  const [dockDelayMs, setDockDelayMs] = useState<number>(props.settings.dock.hideDelayMs)
  const [hiddenWidthPx, setHiddenWidthPx] = useState<number>(props.settings.dock.hiddenWidthPx)
  const [shownWidthPx, setShownWidthPx] = useState<number>(props.settings.dock.shownWidthPx)

  const localeForLabels = useMemo(() => lang, [lang])

  // 贴边模式下用户拖拽调整宽度会实时写回 settings，这里同步刷新输入框显示
  useEffect(() => {
    setShownWidthPx(props.settings.dock.shownWidthPx)
  }, [props.settings.dock.shownWidthPx])

  return (
    <Modal title={t(localeForLabels, 'settings.title')} onClose={props.onClose}>
      <div className="field">
        <label>{t(localeForLabels, 'settings.theme')}</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
          <option value="system">{t(localeForLabels, 'settings.theme.system')}</option>
          <option value="dark">{t(localeForLabels, 'settings.theme.dark')}</option>
          <option value="light">{t(localeForLabels, 'settings.theme.light')}</option>
        </select>
      </div>

      <div className="field">
        <label>{t(localeForLabels, 'settings.language')}</label>
        <select value={lang} onChange={(e) => setLang(e.target.value as Locale)}>
          <option value="zh-CN">{t(localeForLabels, 'settings.language.zhCN')}</option>
          <option value="zh-TW">{t(localeForLabels, 'settings.language.zhTW')}</option>
          <option value="en">{t(localeForLabels, 'settings.language.en')}</option>
          <option value="ja">{t(localeForLabels, 'settings.language.ja')}</option>
          <option value="ko">{t(localeForLabels, 'settings.language.ko')}</option>
        </select>
      </div>

      <div className="field">
        <label>{t(localeForLabels, 'settings.dockDelay')}</label>
        <input
          type="number"
          min={0}
          max={5000}
          value={dockDelayMs}
          onChange={(e) => setDockDelayMs(Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>{t(localeForLabels, 'settings.hiddenWidth')}</label>
        <input
          type="number"
          min={6}
          max={200}
          value={hiddenWidthPx}
          onChange={(e) => setHiddenWidthPx(Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>{t(localeForLabels, 'settings.shownWidth')}</label>
        <input
          type="number"
          min={60}
          max={2000}
          value={shownWidthPx}
          onChange={(e) => setShownWidthPx(Number(e.target.value))}
        />
      </div>

      <div className="modal-actions">
        <button className="btn no-drag" onClick={props.onClose}>
          {t(localeForLabels, 'cancel')}
        </button>
        <button
          className="btn no-drag"
          onClick={() =>
            props.onApply({
              theme,
              locale: lang,
              dock: {
                hideDelayMs: clamp(dockDelayMs, 0, 5000),
                hiddenWidthPx: clamp(hiddenWidthPx, 6, 200),
                shownWidthPx: clamp(shownWidthPx, 60, 2000)
              }
            })
          }
        >
          {t(localeForLabels, 'apply')}
        </button>
      </div>
    </Modal>
  )
}

