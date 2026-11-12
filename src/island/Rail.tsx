import { useLayoutEffect, useRef } from 'react'
import { GroupIcon } from '../widgets/GroupIcon'
import type { Tab } from '../types'

interface Props {
  groups: { id: string; title: string; pages: Tab[] }[]
  tab: Tab
  onGroup: (id: string) => void
  /** group ids that get a dot on their icon (unread messages, an update) */
  dots: string[]
  /** Astra's colour: when her page is open the highlight turns into it, icon included, with a glow */
  astraColor: string
}

/** Dark or light text for sitting on a colour, by its brightness. */
function inkOn(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return '#0b0b10'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.58 ? '#0b0b10' : '#ffffff'
}

/**
 * The navigator of the open card, along its bottom edge: one labelled icon per group. A highlight
 * springs to the active group; the pages inside a group are switched from the card's header.
 */
export function Rail({ groups, tab, onGroup, dots, astraColor: color }: Props) {
  const astraColor = color || '#8fa8ff'
  const rail = useRef<HTMLElement>(null)
  const lit = useRef<HTMLSpanElement>(null)
  const active = groups.find((g) => g.pages.includes(tab))?.id

  useLayoutEffect(() => {
    const el = rail.current
    const hl = lit.current
    if (!el || !hl) return
    const place = () => {
      const b = el.querySelector<HTMLElement>('.rail-g.on')
      if (!b) return
      // the island is scaled by the Size setting, so convert screen pixels back to layout pixels
      const r = el.getBoundingClientRect()
      const q = b.getBoundingClientRect()
      const s = r.width / el.offsetWidth || 1
      hl.style.transform = `translateX(${(q.left - r.left) / s}px)`
      hl.style.width = `${q.width / s}px`
    }
    place()
    // the card is still growing when it first opens: lock the highlight to its tab (no easing) until it settles
    let settle = 0
    const ro = new ResizeObserver(() => {
      hl.classList.add('follow')
      place()
      window.clearTimeout(settle)
      settle = window.setTimeout(() => hl.classList.remove('follow'), 120)
    })
    ro.observe(el)
    return () => {
      window.clearTimeout(settle)
      ro.disconnect()
    }
  }, [tab, active, groups])

  return (
    <nav
      className={`rail ${groups.length > 6 ? 'tight' : ''}`}
      ref={rail}
      aria-label="Sections"
      style={{ ['--astra' as string]: astraColor, ['--astra-ink' as string]: inkOn(astraColor) }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className={`rail-lit ${active === 'astra' ? 'is-astra' : ''}`} ref={lit} />
      {groups.map((g) => (
        <div key={g.id} className={`rail-g ${g.id === active ? 'on' : ''} ${g.id === 'astra' ? 'is-astra' : ''}`}>
          <button className="rail-ic" aria-label={g.title} aria-current={g.id === active ? 'page' : undefined} onClick={() => onGroup(g.id)}>
            <GroupIcon id={g.id} size={17} />
            <span className="rail-lb">{g.title}</span>
            {dots.includes(g.id) && <i className="rail-dot" />}
          </button>
        </div>
      ))}
    </nav>
  )
}
