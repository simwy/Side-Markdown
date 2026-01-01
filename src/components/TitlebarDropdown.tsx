import React, { useEffect, useRef, useState } from 'react'

export type TitlebarDropdownItem = {
  label: string
  onClick: () => void
}

export function TitlebarDropdown(props: {
  buttonLabel: string
  items: TitlebarDropdownItem[]
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current
      if (!root) return
      if (!root.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="dropdown no-drag" ref={rootRef}>
      <button className="btn no-drag" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {props.buttonLabel}
      </button>
      {open ? (
        <div className="dropdown-menu" role="menu">
          {props.items.map((it) => (
            <button
              key={it.label}
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

