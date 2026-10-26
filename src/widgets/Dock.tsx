import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GroupIcon } from './GroupIcon'

interface Props {
  groups: { id: string; title: string }[]
  activeId?: string
  onSelect: (id: string) => void
}

// icon button: 20px icon + 10px padding each side; the dock has 4px padding and 4px gaps (see .dock in App.css)
const BASE = 40
const PAD = 4
const GAP = 4

/**
 * Bottom navigation. The active item grows to show its label and a highlight slides to it.
 * Both are driven by the same CSS timing: the highlight's target is computed from the final item
 * widths (icon + measured label), so it stays locked to the item while the item is still growing.
 */
export function Dock({ groups, activeId, onSelect }: Props) {
  const labels = useRef<Record<string, HTMLElement | null>>({})
  const [rect, setRect] = useState<{ x: number; w: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const measure = () => {
      let x = PAD
      let found: { x: number; w: number } | null = null
      for (const g of groups) {
        const w = BASE + (g.id === activeId ? labels.current[g.id]?.offsetWidth ?? 0 : 0)
        if (g.id === activeId) found = { x, w }
        x += w + GAP
      }
      setRect(found)
    }
    measure()
    // label widths change once the font has loaded
    document.fonts?.ready.then(measure)
  }, [groups, activeId])

  // skip the slide-in on first paint
  useLayoutEffect(() => {
    if (rect && !ready) requestAnimationFrame(() => setReady(true))
  }, [rect, ready])

  // the highlight catches the light while it travels
  const [moving, setMoving] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setMoving(true)
    const t = setTimeout(() => setMoving(false), 650)
    return () => clearTimeout(t)
  }, [activeId])

  return (
    <div className="dock" onClick={(e) => e.stopPropagation()}>
      {rect && (
        <span
          className={`dock-ind ${ready ? 'ready' : ''} ${moving ? 'moving' : ''}`}
          style={{ width: rect.w, transform: `translateX(${rect.x}px)` }}
        />
      )}
      {groups.map((g) => (
        <button
          key={g.id}
          aria-label={g.title}
          title={g.title}
          className={g.id === activeId ? 'active' : ''}
          onClick={() => onSelect(g.id)}
        >
          <span className="dock-icon">
            <GroupIcon id={g.id} />
          </span>
          <span className="dock-label">
            <span className="dock-label-clip">
              <em ref={(el) => void (labels.current[g.id] = el)}>{g.title}</em>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
