import { useState } from 'react'
import { play } from 'cuelume'

type HSV = { h: number; s: number; v: number }

function hsvToHex({ h, s, v }: HSV) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}

function hexToHsv(hex: string): HSV | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

interface Props {
  value: string
  onAdd: (hex: string) => void
}

/** Saturation/brightness square, hue strip, hex field and an Add button. Nothing is applied until Add. */
export function ColorPicker({ value, onAdd }: Props) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value) ?? { h: 140, s: 0.7, v: 0.9 })
  const [text, setText] = useState(() => hsvToHex(hsv))
  const hex = hsvToHex(hsv)

  const set = (next: HSV) => {
    setHsv(next)
    setText(hsvToHex(next))
  }

  // drag handlers shared by the square and the strip
  const drag = (apply: (x: number, y: number) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const move = (ev: { clientX: number; clientY: number }) => {
        const r = e.currentTarget.getBoundingClientRect()
        apply(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)))
      }
      move(e)
      const el = e.currentTarget
      const onMove = (ev: PointerEvent) => move(ev)
      const onUp = () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
    },
  })

  return (
    <div className="cp" onClick={(e) => e.stopPropagation()}>
      <div className="cp-top">
        <span className="cp-preview" style={{ background: hex }} />
        <input
          className="cp-hex"
          value={text}
          spellCheck={false}
          data-cuelume-type
          onChange={(e) => {
            setText(e.target.value)
            const parsed = hexToHsv(e.target.value)
            if (parsed) setHsv(parsed)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              play('tap')
              onAdd(hex)
            }
          }}
        />
        <button className="cp-add" data-cuelume-tap onClick={() => onAdd(hex)}>
          Add
        </button>
      </div>
      <div className="cp-body">
        <div
          className="cp-sv"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
          {...drag((x, y) => set({ ...hsv, s: x, v: 1 - y }))}
        >
          <span className="cp-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div className="cp-hue" {...drag((_, y) => set({ ...hsv, h: y * 360 }))}>
          <span className="cp-bar" style={{ top: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
