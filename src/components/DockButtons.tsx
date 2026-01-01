import React, { useEffect, useState } from 'react'
import { IconAlignCenter, IconAlignLeft, IconAlignRight } from './icons/TitlebarIcons'

export function DockButtons() {
  const [dock, setDock] = useState<'left' | 'center' | 'right'>('center')

  useEffect(() => {
    // 主进程可能因为用户拖动窗口而取消贴边，这里同步按钮选中态
    return window.electronAPI.onWindowDockMode((mode) => setDock(mode))
  }, [])

  return (
    <div className="dock-group no-drag" aria-label="Dock group">
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

