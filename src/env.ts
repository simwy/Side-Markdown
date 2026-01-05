/**
 * Build-time env injected by Vite (renderer only).
 * Note: values are baked into the bundle at build time.
 */

import type { AnalyticsRegionMode } from './analytics'
import type { AnalyticsProviderMode } from './analytics'

function trimOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function parseBool(v: unknown, defaultValue: boolean): boolean {
  if (typeof v !== 'string') return defaultValue
  const s = v.trim().toLowerCase()
  if (!s) return defaultValue
  if (['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(s)) return true
  if (['0', 'false', 'no', 'n', 'off', 'disable', 'disabled'].includes(s)) return false
  return defaultValue
}

function parseRegion(v: unknown, defaultValue: AnalyticsRegionMode): AnalyticsRegionMode {
  if (typeof v !== 'string') return defaultValue
  const s = v.trim().toLowerCase()
  if (s === 'auto' || s === 'cn' || s === 'non-cn') return s
  return defaultValue
}

function parseProvider(v: unknown, defaultValue: AnalyticsProviderMode): AnalyticsProviderMode {
  if (typeof v !== 'string') return defaultValue
  const s = v.trim().toLowerCase()
  if (s === 'auto' || s === 'baidu' || s === 'ga' || s === 'both') return s
  return defaultValue
}

export const ANALYTICS_ENV_IDS = {
  baiduSiteId: trimOrEmpty(import.meta.env.VITE_BAIDU_SITE_ID),
  googleMeasurementId: trimOrEmpty(import.meta.env.VITE_GA_MEASUREMENT_ID)
} as const

export const ANALYTICS_ENV = {
  // Defaults: enabled + auto region detection (language/timezone)
  enabled: parseBool(import.meta.env.VITE_ANALYTICS_ENABLED, true),
  region: parseRegion(import.meta.env.VITE_ANALYTICS_REGION, 'auto'),
  provider: parseProvider(import.meta.env.VITE_ANALYTICS_PROVIDER, 'auto'),
  debug: parseBool(import.meta.env.VITE_ANALYTICS_DEBUG, false)
} as const
