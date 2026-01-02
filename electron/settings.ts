import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppSettings } from './shared'

const SETTINGS_FILE = 'settings.json'

export function getDefaultSettings(): AppSettings {
  return {
    theme: 'system',
    locale: 'zh-CN',
    dock: {
      hideDelayMs: 250,
      hiddenWidthPx: 10,
      shownWidthPx: 200,
      shownHeightPx: undefined
    }
  }
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

export async function readSettings(): Promise<AppSettings> {
  const defaults = getDefaultSettings()
  try {
    const p = getSettingsPath()
    const raw = await fs.readFile(p, 'utf8')
    const json = JSON.parse(raw) as Partial<AppSettings>
    return mergeSettings(defaults, json)
  } catch {
    return defaults
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  const p = getSettingsPath()
  const dir = path.dirname(p)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(p, JSON.stringify(settings, null, 2), 'utf8')
}

export function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = {
    theme: patch.theme ?? base.theme,
    locale: patch.locale ?? base.locale,
    dock: {
      hideDelayMs: patch.dock?.hideDelayMs ?? base.dock.hideDelayMs,
      hiddenWidthPx: patch.dock?.hiddenWidthPx ?? base.dock.hiddenWidthPx,
      shownWidthPx: patch.dock?.shownWidthPx ?? base.dock.shownWidthPx,
      shownHeightPx: patch.dock?.shownHeightPx ?? base.dock.shownHeightPx
    }
  }
  return sanitizeSettings(next)
}

export function sanitizeSettings(s: AppSettings): AppSettings {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
  return {
    theme: s.theme,
    locale: s.locale,
    dock: {
      hideDelayMs: clamp(Number(s.dock.hideDelayMs || 0), 0, 5000),
      hiddenWidthPx: clamp(Number(s.dock.hiddenWidthPx || 0), 6, 200),
      shownWidthPx: clamp(Number(s.dock.shownWidthPx || 0), 60, 2000),
      shownHeightPx:
        s.dock.shownHeightPx == null ? undefined : clamp(Number(s.dock.shownHeightPx || 0), 200, 5000)
    }
  }
}

