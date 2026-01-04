import React, { useEffect, useRef, useState } from 'react'

export type TitlebarDropdownItem = {
  kind?: 'item' | 'separator' | 'label'
  label: string
  rightText?: string
  onClick?: () => void
  children?: TitlebarDropdownItem[]
  disabled?: boolean
  badge?: 'dot'
}

export function TitlebarDropdown(props: {
  buttonLabel: string
  items: TitlebarDropdownItem[]
}) {
  const [open, setOpen] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState<TitlebarDropdownItem | null>(null)
  const [submenuTopPx, setSubmenuTopPx] = useState<number>(0)
  const [submenuDir, setSubmenuDir] = useState<'right' | 'left'>('right')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    // 关闭/重新打开时，重置子菜单
    if (!open) setActiveSubmenu(null)
  }, [open])

  const rootItems = props.items
  const submenuItems = activeSubmenu?.children ?? null

  const openSubmenuFor = (it: TitlebarDropdownItem, anchorEl: HTMLElement) => {
    const menuEl = menuRef.current
    if (!menuEl) {
      setActiveSubmenu(it)
      return
    }
    const menuRect = menuEl.getBoundingClientRect()
    const itemRect = anchorEl.getBoundingClientRect()
    // 对齐到该行
    setSubmenuTopPx(Math.max(0, Math.round(itemRect.top - menuRect.top)))

    // 智能方向：右侧空间不足则向左飞出（避免“看不见”）
    const approxSubmenuWidth = 180
    const gap = 8
    const spaceRight = window.innerWidth - itemRect.right
    setSubmenuDir(spaceRight >= approxSubmenuWidth + gap ? 'right' : 'left')

    setActiveSubmenu(it)
  }

  return (
    <div className="dropdown no-drag" ref={rootRef}>
      <button className="btn no-drag" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {props.buttonLabel}
      </button>
      {open ? (
        <div className="dropdown-menu" role="menu" ref={menuRef}>
          {rootItems.map((it, idx) => {
            if (it.kind === 'separator') {
              return <div key={`sep__${idx}`} className="dropdown-sep" role="separator" />
            }
            if (it.kind === 'label') {
              return (
                <div key={`label__${idx}`} className="dropdown-label" role="presentation">
                  <span className="dropdown-text">{it.label}</span>
                  <span className="dropdown-right">
                    {it.rightText ? <span className="dropdown-right-text">{it.rightText}</span> : null}
                    {it.badge === 'dot' ? <span className="dropdown-badge-dot" aria-hidden="true" /> : null}
                  </span>
                </div>
              )
            }

            const hasChildren = Array.isArray(it.children) && it.children.length > 0
            const disabled = !!it.disabled
            const isActive = activeSubmenu?.label === it.label
            return (
              <button
                key={`${it.label}__${idx}`}
                className={`dropdown-item ${hasChildren && isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                role="menuitem"
                disabled={disabled}
                onMouseEnter={(e) => {
                  if (disabled) return
                  // hover 展开子菜单；移到其它项时关闭
                  if (hasChildren) openSubmenuFor(it, e.currentTarget)
                  else setActiveSubmenu(null)
                }}
                onClick={(e) => {
                  if (disabled) return
                  if (hasChildren) {
                    openSubmenuFor(it, e.currentTarget)
                    return
                  }
                  if (!it.onClick) return
                  setOpen(false)
                  setActiveSubmenu(null)
                  it.onClick()
                }}
              >
                <span className="dropdown-text">{it.label}</span>
                <span className="dropdown-right">
                  {it.rightText ? <span className="dropdown-right-text">{it.rightText}</span> : null}
                  {it.badge === 'dot' ? <span className="dropdown-badge-dot" aria-hidden="true" /> : null}
                  {hasChildren ? <span className="dropdown-caret">›</span> : null}
                </span>
              </button>
            )
          })}

          {submenuItems ? (
            <div
              className={`dropdown-menu submenu ${submenuDir === 'left' ? 'left' : 'right'}`}
              role="menu"
              style={{ top: submenuTopPx }}
            >
              {submenuItems.map((it, idx) => {
                if (it.kind === 'separator') {
                  return <div key={`sep__sub__${idx}`} className="dropdown-sep" role="separator" />
                }
                if (it.kind === 'label') {
                  return (
                    <div key={`label__sub__${idx}`} className="dropdown-label" role="presentation">
                      <span className="dropdown-text">{it.label}</span>
                      <span className="dropdown-right">
                        {it.rightText ? <span className="dropdown-right-text">{it.rightText}</span> : null}
                        {it.badge === 'dot' ? <span className="dropdown-badge-dot" aria-hidden="true" /> : null}
                      </span>
                    </div>
                  )
                }

                return (
                  <button
                    key={`${it.label}__sub__${idx}`}
                    className={`dropdown-item ${it.disabled ? 'disabled' : ''}`}
                    role="menuitem"
                    disabled={!!it.disabled}
                    onClick={() => {
                      if (it.disabled) return
                      if (!it.onClick) return
                      setOpen(false)
                      setActiveSubmenu(null)
                      it.onClick()
                    }}
                  >
                    <span className="dropdown-text">{it.label}</span>
                    <span className="dropdown-right">
                      {it.rightText ? <span className="dropdown-right-text">{it.rightText}</span> : null}
                      {it.badge === 'dot' ? <span className="dropdown-badge-dot" aria-hidden="true" /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

