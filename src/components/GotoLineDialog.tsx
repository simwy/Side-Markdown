import React, { useState } from 'react'
import { Modal } from './Modal'

export function GotoLineDialog(props: {
  maxLine: number
  onClose: () => void
  onGo: (line1Based: number) => void
}) {
  const [line, setLine] = useState(1)

  return (
    <Modal title="转到行" onClose={props.onClose}>
      <div className="field">
        <label>行号（1 - {props.maxLine}）</label>
        <input
          type="number"
          min={1}
          max={props.maxLine}
          value={line}
          onChange={(e) => setLine(Number(e.target.value))}
        />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={props.onClose}>
          取消
        </button>
        <button
          className="btn"
          onClick={() => {
            const n = Math.max(1, Math.min(props.maxLine, Number.isFinite(line) ? line : 1))
            props.onGo(n)
          }}
        >
          跳转
        </button>
      </div>
    </Modal>
  )
}


