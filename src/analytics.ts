import type { Locale } from '../electron/shared'

export type AnalyticsRegionMode = 'auto' | 'cn' | 'non-cn'

export type AnalyticsProviderMode = 'auto' | 'baidu' | 'ga' | 'both'

export type AnalyticsSettings = {
  /**
   * Whether analytics is enabled.
   * When false: do not inject scripts and do not send events.
   */
  enabled: boolean
  /**
   * Region detection:
   * - auto: based on language/timezone heuristic
   * - cn: force China user
   * - non-cn: force non-China user
   */
  region: AnalyticsRegionMode
  /** Baidu Tongji siteId (hm.js?{siteId}) */
  baiduSiteId: string
  /** Google Analytics Measurement ID (e.g. G-XXXXXXX) */
  googleMeasurementId: string
  /** Optional debug mode (prints to console) */
  debug?: boolean
  /**
   * Provider override:
   * - auto: choose by region + available ids (default)
   * - baidu: force Baidu (requires baiduSiteId)
   * - ga: force Google (requires googleMeasurementId)
   * - both: send to both when ids are provided
   */
  provider?: AnalyticsProviderMode
}

type AnalyticsProvider = 'none' | 'baidu' | 'ga' | 'both'

declare global {
  interface Window {
    // Google Analytics (gtag)
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    // Baidu Tongji
    _hmt?: unknown[]
  }
}

let currentProvider: AnalyticsProvider = 'none'
let currentEnabled = false
let currentDebug = false
let lastInitKey: string | null = null
let lastTimezone: string = ''
let lastIsChina: boolean = false
let lastRegionMode: AnalyticsRegionMode = 'auto'
let gaScriptLoaded = false
let baiduScriptLoaded = false
let networkTapInstalled = false
let gaMeasurementIdCurrent = ''
let gaClientIdCurrent = ''

const pendingGa: Array<{ name: string; params?: Record<string, unknown> }> = []
const pendingBaidu: Array<{ name: string; params?: Record<string, unknown> }> = []

function maskId(id: string): string {
  const s = (id || '').trim()
  if (!s) return ''
  if (s.length <= 6) return `${s[0] ?? ''}***${s[s.length - 1] ?? ''}`
  return `${s.slice(0, 3)}***${s.slice(-3)}`
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return '[unserializable]'
  }
}

function shouldTapUrl(url: string): boolean {
  return (
    /(hm\.baidu\.com|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)\b/i.test(url) ||
    /\/(g\/)?collect\b/i.test(url) ||
    /\/mp\/collect\b/i.test(url)
  )
}

function installNetworkTapOnce() {
  if (networkTapInstalled) return
  networkTapInstalled = true

  // fetch
  const origFetch = window.fetch?.bind(window)
  if (typeof origFetch === 'function') {
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (shouldTapUrl(url)) {
        // eslint-disable-next-line no-console
        console.log('[analytics:net]', { api: 'fetch', method: init?.method || 'GET', url })
      }
      return origFetch(input as never, init as never)
    }
  }

  // sendBeacon
  const origSendBeacon = navigator.sendBeacon?.bind(navigator)
  if (typeof origSendBeacon === 'function') {
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (shouldTapUrl(u)) {
        // eslint-disable-next-line no-console
        console.log('[analytics:net]', {
          api: 'sendBeacon',
          url: u,
          dataType: data == null ? null : typeof data
        })
      }
      return origSendBeacon(url as never, data as never)
    }
  }

  // XHR
  const origXhrOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    const u = typeof url === 'string' ? url : url.toString()
    if (shouldTapUrl(u)) {
      // eslint-disable-next-line no-console
      console.log('[analytics:net]', { api: 'xhr', method, url: u })
    }
    return origXhrOpen.call(this, method, url as never, async as never, username as never, password as never)
  }

  // Image pixel
  const imgDesc = Object.getOwnPropertyDescriptor(Image.prototype, 'src')
  if (imgDesc?.set) {
    Object.defineProperty(Image.prototype, 'src', {
      ...imgDesc,
      set(value: string) {
        if (typeof value === 'string' && shouldTapUrl(value)) {
          // eslint-disable-next-line no-console
          console.log('[analytics:net]', { api: 'image', url: value })
        }
        imgDesc.set!.call(this, value)
      }
    })
  }
}

function logDebug(...args: unknown[]) {
  if (!currentDebug) return
  // eslint-disable-next-line no-console
  console.log('[analytics]', ...args)
}

function guessIsChinaUser(): boolean {
  // Only use OS timezone to infer CN/non-CN (no language/locale heuristics).
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase()
  if (!tz) return false

  // China Standard Time (CST, UTC+8) is typically represented by Asia/Shanghai.
  // Xinjiang time is commonly Asia/Urumqi.
  // Note: some environments may still report legacy IANA links; keep them for compatibility.
  const chinaTimezones = new Set([
    'asia/shanghai',
    'asia/urumqi',
    // legacy/alias zones (links to Asia/Shanghai in tzdb)
    'asia/chongqing',
    'asia/harbin',
    'asia/kashgar'
  ])

  return chinaTimezones.has(tz)
}

function isChinaUser(regionMode: AnalyticsRegionMode): boolean {
  if (regionMode === 'cn') return true
  if (regionMode === 'non-cn') return false
  return guessIsChinaUser()
}

function getOsTimezoneLowercase(): string {
  return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase()
}

function resolveProvider(s: AnalyticsSettings): AnalyticsProvider {
  if (!s.enabled) return 'none'
  const cn = isChinaUser(s.region)

  const hasBaidu = Boolean(s.baiduSiteId?.trim())
  const hasGa = Boolean(s.googleMeasurementId?.trim())

  const mode = (s.provider || 'auto') as AnalyticsProviderMode
  if (mode === 'baidu') return hasBaidu ? 'baidu' : 'none'
  if (mode === 'ga') return hasGa ? 'ga' : 'none'
  if (mode === 'both') return hasBaidu || hasGa ? 'both' : 'none'

  // auto
  if (cn) return hasBaidu ? 'baidu' : hasGa ? 'ga' : 'none'
  return hasGa ? 'ga' : hasBaidu ? 'baidu' : 'none'
}

function injectBaidu(siteId: string) {
  if (!siteId) return
  const existing = document.querySelector(`script[data-analytics="baidu"][data-site-id="${siteId}"]`) as
    | HTMLScriptElement
    | null
  if (existing) {
    baiduScriptLoaded = existing.dataset.loaded === '1'
    // eslint-disable-next-line no-console
    console.log('[analytics:inject]', { provider: 'baidu', status: baiduScriptLoaded ? 'loaded(existing)' : 'existing' })
    if (baiduScriptLoaded) flushQueue('baidu')
    return
  }

  window._hmt = window._hmt || []
  baiduScriptLoaded = false
  // eslint-disable-next-line no-console
  console.log('[analytics:inject]', { provider: 'baidu', script: 'hm.js', siteId: maskId(siteId) })
  const hm = document.createElement('script')
  hm.async = true
  hm.src = `https://hm.baidu.com/hm.js?${encodeURIComponent(siteId)}`
  hm.dataset.analytics = 'baidu'
  hm.dataset.siteId = siteId
  hm.onload = () => {
    logDebug('Baidu script loaded')
    baiduScriptLoaded = true
    hm.dataset.loaded = '1'
    // eslint-disable-next-line no-console
    console.log('[analytics:inject]', { provider: 'baidu', status: 'loaded' })
    flushQueue('baidu')
  }
  hm.onerror = () => {
    logDebug('Baidu script failed to load')
    baiduScriptLoaded = false
    hm.dataset.loaded = '0'
    // eslint-disable-next-line no-console
    console.log('[analytics:inject]', { provider: 'baidu', status: 'error' })
  }
  document.head.appendChild(hm)
}

function injectGA(measurementId: string) {
  if (!measurementId) return
  const existing = document.querySelector(`script[data-analytics="ga"][data-measurement-id="${measurementId}"]`) as
    | HTMLScriptElement
    | null
  if (existing) {
    gaMeasurementIdCurrent = measurementId
    gaScriptLoaded = existing.dataset.loaded === '1'
    // eslint-disable-next-line no-console
    console.log('[analytics:inject]', { provider: 'ga', status: gaScriptLoaded ? 'loaded(existing)' : 'existing' })
    if (gaScriptLoaded) {
      try {
        window.gtag?.('get', measurementId, 'client_id', (cid: unknown) => {
          // eslint-disable-next-line no-console
          console.log('[analytics:ga]', { status: 'client_id', measurementId: maskId(measurementId), clientId: cid })
        })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[analytics:ga]', { status: 'get_client_id_error', error: e instanceof Error ? e.message : String(e) })
      }
      flushQueue('ga')
    }
    return
  }

  gaMeasurementIdCurrent = measurementId

  // Electron often runs with `file://` origin and/or stricter cookie settings.
  // Provide a stable client_id and disable client storage to make GA more reliable in desktop contexts.
  try {
    const key = 'side_markdown_ga_client_id'
    const ls = window.localStorage
    const existingCid = typeof ls?.getItem === 'function' ? (ls.getItem(key) || '').trim() : ''
    const cid = existingCid || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
    if (!existingCid && typeof ls?.setItem === 'function') ls.setItem(key, cid)
    gaClientIdCurrent = cid
  } catch {
    gaClientIdCurrent = ''
  }

  // Stub dataLayer + gtag first so calls are queued even before network loads
  window.dataLayer = window.dataLayer || []
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer!.push(args)
    }

  window.gtag('js', new Date())
  const configParams = {
    anonymize_ip: true,
    send_page_view: false,
    debug_mode: currentDebug,
    // Avoid relying on cookies; use provided client_id instead (best-effort).
    client_storage: 'none' as const,
    ...(gaClientIdCurrent ? { client_id: gaClientIdCurrent } : {})
  } as const
  window.gtag('config', measurementId, configParams)

  gaScriptLoaded = false
  // eslint-disable-next-line no-console
  console.log('[analytics:inject]', {
    provider: 'ga',
    script: 'gtag.js',
    measurementId: maskId(measurementId)
  })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  s.dataset.analytics = 'ga'
  s.dataset.measurementId = measurementId
  s.onload = () => {
    logDebug('GA script loaded')
    gaScriptLoaded = true
    s.dataset.loaded = '1'
    // eslint-disable-next-line no-console
    console.log('[analytics:inject]', { provider: 'ga', status: 'loaded' })

    // Re-config once script is definitely loaded, then try to read client_id.
    try {
      window.gtag?.('config', measurementId, configParams)
      window.gtag?.('get', measurementId, 'client_id', (cid: unknown) => {
        // eslint-disable-next-line no-console
        console.log('[analytics:ga]', { status: 'client_id', measurementId: maskId(measurementId), clientId: cid })
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[analytics:ga]', { status: 'get_client_id_error', error: e instanceof Error ? e.message : String(e) })
    }

    flushQueue('ga')
  }
  s.onerror = () => {
    logDebug('GA script failed to load')
    gaScriptLoaded = false
    s.dataset.loaded = '0'
    // eslint-disable-next-line no-console
    console.log('[analytics:inject]', { provider: 'ga', status: 'error' })
  }
  document.head.appendChild(s)
}

function sendToGa(name: string, params?: Record<string, unknown>) {
  // Important: we stub `window.gtag` before loading gtag.js, so `typeof window.gtag === 'function'`
  // does NOT guarantee events are actually sent to GA. Gate on the script onload instead.
  if (!gaScriptLoaded || typeof window.gtag !== 'function') {
    // eslint-disable-next-line no-console
    console.log('[analytics:send]', {
      provider: 'ga',
      status: gaScriptLoaded ? 'queued(no-gtag)' : 'queued(gtag-js-not-loaded)',
      event: name,
      params
    })
    pendingGa.push({ name, params })
    return
  }
  // eslint-disable-next-line no-console
  console.log('[analytics:send]', { provider: 'ga', status: 'gtag(event)', event: name, params })
  const nextParams: Record<string, unknown> = { ...(params || {}) }
  // Ensure event is routed to the intended GA4 stream.
  if (gaMeasurementIdCurrent) nextParams.send_to = gaMeasurementIdCurrent
  if (currentDebug) {
    nextParams.event_timeout = 2000
    nextParams.event_callback = () => {
      // eslint-disable-next-line no-console
      console.log('[analytics:ga]', { status: 'event_callback', event: name })
    }
  }
  window.gtag('event', name, nextParams)
}

function sendToBaidu(name: string, params?: Record<string, unknown>) {
  window._hmt = window._hmt || []
  if (!baiduScriptLoaded) {
    // eslint-disable-next-line no-console
    console.log('[analytics:send]', { provider: 'baidu', status: 'queued(hm-js-not-loaded)', event: name, params })
    pendingBaidu.push({ name, params })
    return
  }
  // Baidu Tongji: _trackEvent(category, action, opt_label, opt_value)
  const label = params ? safeJson(params) : ''
  const args = ['_trackEvent', 'app', name, label] as const
  // eslint-disable-next-line no-console
  console.log('[analytics:send]', { provider: 'baidu', status: '_hmt.push(_trackEvent)', args })
  ;(window._hmt as unknown[]).push(args as unknown as unknown[])
}

function send(provider: AnalyticsProvider, name: string, params?: Record<string, unknown>) {
  if (provider === 'ga') {
    sendToGa(name, params)
    return
  }
  if (provider === 'baidu') {
    sendToBaidu(name, params)
    return
  }
  if (provider === 'both') {
    // Best-effort: send to each provider; pending queues ensure eventual delivery after scripts load.
    sendToBaidu(name, params)
    sendToGa(name, params)
  }
}

function flushQueue(provider: 'baidu' | 'ga') {
  if (currentProvider === 'none') return
  if (!currentEnabled) return
  const q = provider === 'ga' ? pendingGa : pendingBaidu
  if (q.length === 0) return
  const copy = q.splice(0, q.length)
  // eslint-disable-next-line no-console
  console.log('[analytics:flushQueue]', { provider, count: copy.length, mode: currentProvider })
  for (const e of copy) send(provider, e.name, e.params)
}

export function initAnalytics(opts: {
  settings: AnalyticsSettings
  locale: Locale
  appVersion?: string
}) {
  const { settings } = opts
  currentEnabled = settings.enabled
  currentDebug = Boolean(settings.debug)
  lastRegionMode = settings.region
  lastTimezone = getOsTimezoneLowercase()
  lastIsChina = isChinaUser(settings.region)
  // Reset script loaded flags on init; injection will flip them.
  gaScriptLoaded = false
  baiduScriptLoaded = false
  gaMeasurementIdCurrent = ''
  pendingGa.length = 0
  pendingBaidu.length = 0
  installNetworkTapOnce()

  const hasBaidu = Boolean(settings.baiduSiteId?.trim())
  const hasGa = Boolean(settings.googleMeasurementId?.trim())
  const nextProvider = resolveProvider(settings)

  // eslint-disable-next-line no-console
  console.log('[analytics:init]', {
    enabled: currentEnabled,
    regionMode: lastRegionMode,
    timezone: lastTimezone,
    isChinaUser: lastIsChina,
    hasBaiduSiteId: hasBaidu,
    hasGaMeasurementId: hasGa,
    provider: nextProvider,
    providerMode: settings.provider || 'auto',
    debug: currentDebug
  })
  if (nextProvider === 'none') {
    currentProvider = 'none'
    // eslint-disable-next-line no-console
    console.log('[analytics:init]', {
      provider: 'none',
      reason: !currentEnabled ? 'disabled' : 'missing_ids',
      baiduSiteId: hasBaidu ? maskId(settings.baiduSiteId) : '',
      googleMeasurementId: hasGa ? maskId(settings.googleMeasurementId) : ''
    })
    return
  }

  if (nextProvider !== currentProvider) {
    logDebug('provider', currentProvider, '->', nextProvider)
    currentProvider = nextProvider
  }

  if (currentProvider === 'baidu') injectBaidu(settings.baiduSiteId.trim())
  if (currentProvider === 'ga') injectGA(settings.googleMeasurementId.trim())
  if (currentProvider === 'both') {
    if (hasBaidu) injectBaidu(settings.baiduSiteId.trim())
    if (hasGa) injectGA(settings.googleMeasurementId.trim())
  }

  // Try to flush in case provider already exists
  if (currentProvider === 'baidu') flushQueue('baidu')
  else if (currentProvider === 'ga') flushQueue('ga')
  else if (currentProvider === 'both') {
    flushQueue('baidu')
    flushQueue('ga')
  }

  const initKey =
    currentProvider === 'baidu'
      ? `baidu|${settings.baiduSiteId.trim()}`
      : currentProvider === 'ga'
        ? `ga|${settings.googleMeasurementId.trim()}`
        : currentProvider === 'both'
          ? `both|${settings.baiduSiteId.trim()}|${settings.googleMeasurementId.trim()}`
        : 'none'
  if (initKey !== 'none' && initKey !== lastInitKey) {
    lastInitKey = initKey
    trackEvent('app_init', {
      provider: currentProvider,
      locale: opts.locale,
      appVersion: opts.appVersion || ''
    })
  }
}

export function getAnalyticsProvider(): AnalyticsProvider {
  return currentProvider
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!currentEnabled) return
  if (currentProvider === 'none') return
  // Always print region inference when an analytics event is triggered.
  // eslint-disable-next-line no-console
  console.log('[analytics]', {
    event: name,
    provider: currentProvider,
    timezone: lastTimezone,
    isChinaUser: lastIsChina,
    regionMode: lastRegionMode
  })
  const nextParams =
    (currentProvider === 'ga' || currentProvider === 'both') && currentDebug ? { ...(params || {}), debug_mode: true } : params
  send(currentProvider, name, nextParams)
}

