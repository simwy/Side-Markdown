import React, { useEffect, useState } from 'react'
import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconPin } from './icons/TitlebarIcons'

export function DockButtons() {
  const [dock, setDock] = useState<'left' | 'center' | 'right'>('center')
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    void window.electronAPI.windowIsAlwaysOnTop().then(setPinned)
    unsub = window.electronAPI.onWindowAlwaysOnTop((v) => setPinned(v))
    return () => unsub()
  }, [])

  return (
    <div className="dock-group no-drag" aria-label="Dock group">
      <button
        className={`seg-btn ${pinned ? 'active' : ''}`}
        title="钉住窗口（始终置顶）"
        onClick={async () => {
          const next = await window.electronAPI.windowToggleAlwaysOnTop()
          setPinned(next)
        }}
      >
        <IconPin size={14} />
      </button>
      <button
        className={`seg-btn ${dock === 'left' ? 'active' : ''}`}
        title="居左（贴边）"
        onClick={() => {
          setDock('left')
          void window.electronAPI.windowDock('left')
        }}
      >
        <IconAlignLeft size={14} />
      </button>
      <button
        className={`seg-btn ${dock === 'center' ? 'active' : ''}`}
        title="居中"
        onClick={() => {
          setDock('center')
          void window.electronAPI.windowDock('center')
        }}
      >
        <IconAlignCenter size={14} />
      </button>
      <button
        className={`seg-btn ${dock === 'right' ? 'active' : ''}`}
        title="居右（贴边）"
        onClick={() => {
          setDock('right')
          void window.electronAPI.windowDock('right')
        }}
      >
        <IconAlignRight size={14} />
      </button>
    </div>
  )
}

