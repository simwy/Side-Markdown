import React from 'react'

export function Modal(props: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  )
}


