import React, { useMemo, useState } from 'react'
import type { EditorFont } from '../appTypes'
import { Modal } from './Modal'

const COMMON_FONTS = [
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  'Liberation Mono',
  'Courier New',
  'JetBrains Mono',
  'Fira Code'
]

export function FontDialog(props: {
  value: EditorFont
  onClose: () => void
  onApply: (next: EditorFont) => void
}) {
  const [family, setFamily] = useState(props.value.family)
  const [sizePx, setSizePx] = useState(props.value.sizePx)
  const [weight, setWeight] = useState(props.value.weight)
  const [italic, setItalic] = useState(props.value.italic)

  const familyOptions = useMemo(() => Array.from(new Set(COMMON_FONTS)), [])

  return (
    <Modal title="字体" onClose={props.onClose}>
      <div className="field">
        <label>字体</label>
        <select value={family} onChange={(e) => setFamily(e.target.value)}>
          {familyOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>大小（px）</label>
        <input
          type="number"
          min={10}
          max={36}
          value={sizePx}
          onChange={(e) => setSizePx(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label>粗细</label>
        <input
          type="number"
          min={200}
          max={900}
          step={100}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} /> 斜体
        </label>
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={props.onClose}>
          取消
        </button>
        <button
          className="btn"
          onClick={() => props.onApply({ family, sizePx, weight, italic })}
        >
          应用
        </button>
      </div>
    </Modal>
  )
}


