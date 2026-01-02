import React, { useEffect, useState } from 'react'
import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconPin } from './icons/TitlebarIcons'

export function DockButtons(props: { mode: 'left' | 'center' | 'right' }) {
  const [dockPinned, setDockPinned] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  useEffect(() => {
    const unsubs: Array<() => void> = []
    void window.electronAPI.windowGetDockPinned().then(setDockPinned)
    void window.electronAPI.windowGetAlwaysOnTop().then(setAlwaysOnTop)
    unsubs.push(window.electronAPI.onWindowDockPinned((v) => setDockPinned(v)))
    unsubs.push(window.electronAPI.onWindowAlwaysOnTop((v) => setAlwaysOnTop(v)))
    return () => unsubs.forEach((u) => u())
  }, [])

  const pinActive = props.mode === 'center' ? alwaysOnTop : dockPinned
  const pinTitle =
    props.mode === 'center' ? '钉住（居中模式：窗口置顶）' : '钉住（贴边模式：展开后不回收）'

  return (
    <div className="dock-group no-drag" aria-label="Dock group">
      <button
        className={`seg-btn ${pinActive ? 'active' : ''}`}
        title={pinTitle}
        onClick={async () => {
          if (props.mode === 'center') {
            const next = await window.electronAPI.windowSetAlwaysOnTop(!alwaysOnTop)
            setAlwaysOnTop(next)
          } else {
            const next = await window.electronAPI.windowSetDockPinned(!dockPinned)
            setDockPinned(next)
          }
        }}
      >
        <IconPin size={14} />
      </button>
      <button
        className={`seg-btn ${props.mode === 'left' ? 'active' : ''}`}
        title="居左（贴边）"
        onClick={() => {
          void window.electronAPI.windowDock('left')
        }}
      >
        <IconAlignLeft size={14} />
      </button>
      <button
        className={`seg-btn ${props.mode === 'center' ? 'active' : ''}`}
        title="居中"
        onClick={() => {
          void window.electronAPI.windowDock('center')
        }}
      >
        <IconAlignCenter size={14} />
      </button>
      <button
        className={`seg-btn ${props.mode === 'right' ? 'active' : ''}`}
        title="居右（贴边）"
        onClick={() => {
          void window.electronAPI.windowDock('right')
        }}
      >
        <IconAlignRight size={14} />
      </button>
    </div>
  )
}

