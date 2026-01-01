import React, { useEffect, useMemo, useState } from 'react'

function isMacPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('mac')
}

export function WindowControls() {
  const isMac = useMemo(() => isMacPlatform(), [])
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    void window.electronAPI.windowIsMaximized().then(setMaximized)
    unsub = window.electronAPI.onWindowMaximized((v) => setMaximized(v))
    return () => unsub()
  }, [])

  if (isMac) {
    return (
      <div className="window-controls mac no-drag" aria-label="Window controls">
        <button className="mac-dot close" title="Close" onClick={() => void window.electronAPI.windowClose()} />
        <button className="mac-dot min" title="Minimize" onClick={() => void window.electronAPI.windowMinimize()} />
        <button
          className="mac-dot max"
          title={maximized ? 'Restore' : 'Zoom'}
          onClick={() => void window.electronAPI.windowToggleMaximize()}
        />
      </div>
    )
  }

  return (
    <div className="window-controls win no-drag" aria-label="Window controls">
      <button className="win-btn" title="Minimize" onClick={() => void window.electronAPI.windowMinimize()}>
        —
      </button>
      <button className="win-btn" title={maximized ? 'Restore' : 'Maximize'} onClick={() => void window.electronAPI.windowToggleMaximize()}>
        {maximized ? '❐' : '□'}
      </button>
      <button className="win-btn close" title="Close" onClick={() => void window.electronAPI.windowClose()}>
        ×
      </button>
    </div>
  )
}

