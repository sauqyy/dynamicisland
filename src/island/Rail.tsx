import { useLayoutEffect, useRef } from 'react'
import { GroupIcon } from '../widgets/GroupIcon'
import { SHORT, type Tab } from '../types'

interface Props {
  groups: { id: string; title: string; pages: Tab[] }[]
  tab: Tab
  onPage: (tab: Tab) => void
  onGroup: (id: string) => void
  /** group ids that get a dot on their icon (unread messages, an update) */
  dots: string[]
}

/** How long a group takes to open (must match .rail-pages in App.css). */
const OPEN_MS = 340

/**
 * The one navigator of the open card: an icon per group, and the active group opened up
 * to show its pages as labels. A highlight slides to the active page; while a group is
 * opening it follows the label every frame, so it stays locked to it as the pill grows.
 */
export function Rail({ groups, tab, onPage, onGroup, dots }: Props) {
  const rail = useRef<HTMLElement>(null)
  const lit = useRef<HTMLSpanElement>(null)
  const active = groups.find((g) => g.pages.includes(tab))?.id
  const lastGroup = useRef(active)

  useLayoutEffect(() => {
    const el = rail.current
    const hl = lit.current
    if (!el || !hl) return
    const place = () => {
      const b = el.querySelector<HTMLElement>('.rail-pg.on')
      if (!b) return
      // the island is scaled by the Size setting, so convert screen pixels back to layout pixels
      const r = el.getBoundingClientRect()
      const q = b.getBoundingClientRect()
      const s = r.width / el.offsetWidth || 1
      hl.style.transform = `translateX(${(q.left - r.left) / s}px)`
      hl.style.width = `${q.width / s}px`
    }
    if (lastGroup.current === active) {
      place()
      return
    }
    lastGroup.current = active
    hl.classList.add('follow')
    const end = performance.now() + OPEN_MS
    let raf = 0
    const loop = () => {
      place()
      if (performance.now() < end) raf = requestAnimationFrame(loop)
      else hl.classList.remove('follow')
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [tab, active, groups])

  return (
    <nav className="rail" ref={rail} aria-label="Pages" onClick={(e) => e.stopPropagation()}>
      <span className="rail-lit" ref={lit} />
      {groups.map((g) => (
        <div key={g.id} className={`rail-g ${g.id === active ? 'on' : ''}`}>
          <button className="rail-ic" aria-label={g.title} title={g.title} onClick={() => onGroup(g.id)}>
            <GroupIcon id={g.id} size={16} />
            {dots.includes(g.id) && <i className="rail-dot" />}
          </button>
          <span className="rail-pages">
            <span className="rail-in">
              {g.pages.map((p) => (
                <button key={p} className={`rail-pg ${p === tab ? 'on' : ''}`} aria-current={p === tab ? 'page' : undefined} tabIndex={g.id === active ? 0 : -1} onClick={() => onPage(p)}>
                  {SHORT[p]}
                </button>
              ))}
            </span>
          </span>
        </div>
      ))}
    </nav>
  )
}
