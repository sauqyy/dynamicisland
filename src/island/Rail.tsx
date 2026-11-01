import { useLayoutEffect, useRef } from 'react'
import { GroupIcon } from '../widgets/GroupIcon'
import { SHORT, type Tab } from '../types'

interface Props {
  groups: { id: string; title: string; pages: Tab[] }[]
  tab: Tab
  onPage: (tab: Tab) => void
  onGroup: (id: string) => void
  /** group ids that get a plain dot on their icon (something without a number, like an update) */
  dots: string[]
  /** what is new on each page: its label gets the number, its group's icon the sum of its pages */
  counts?: PageCounts
  /** Astra's colour: when her page is open the highlight turns into it, icon included, with a glow */
  astraColor: string
}

/** For each page with something new: how many, and what they are ("2 unread messages, 1 friend request"). */
export type PageCounts = Partial<Record<Tab, { n: number; label: string }>>

/** "9+" past nine: a count is a nudge, not a ledger */
const short = (n: number) => (n > 9 ? '9+' : String(n))

/** Dark or light text for sitting on a colour, by its brightness. */
function inkOn(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return '#0b0b10'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.58 ? '#0b0b10' : '#ffffff'
}

/** How long a group takes to open (must match .rail-pages in App.css). */
const OPEN_MS = 340
/** Width of the fade at a scrolled edge (must match .rail-in.more-* in App.css). */
const FADE = 28

/**
 * Moves the highlight onto the active page's label, cut to the part of it that is in view (a
 * label scrolled half out shows half a highlight), and fades the side of the labels with more.
 */
function placeLit(el: HTMLElement, hl: HTMLElement, astra = false) {
  // Astra's highlight wraps her icon as well as her label, and has nothing to scroll
  const b = el.querySelector<HTMLElement>(astra ? '.rail-g.on' : '.rail-pg.on')
  const c = astra ? b : b?.parentElement
  if (!b || !c) return
  if (!astra) {
    c.classList.toggle('more-l', c.scrollLeft > 1)
    c.classList.toggle('more-r', c.scrollLeft + c.clientWidth < c.scrollWidth - 1)
  }
  // the island is scaled by the Size setting, so convert screen pixels back to layout pixels
  const r = el.getBoundingClientRect()
  const q = b.getBoundingClientRect()
  const v = astra ? q : c.getBoundingClientRect()
  const s = r.width / el.offsetWidth || 1
  const left = Math.max(q.left, v.left)
  const right = Math.min(q.right, v.right)
  hl.style.transform = `translateX(${(left - r.left) / s}px)`
  hl.style.width = `${Math.max(0, right - left) / s}px`
}

/**
 * The one navigator of the open card: an icon per group, and the active group opened up
 * to show its pages as labels. A highlight slides to the active page; while a group is
 * opening it follows the label every frame, so it stays locked to it as the pill grows.
 * A group with more labels than the card has room for scrolls them sideways, with the
 * active one kept in view and a fade on the side where there are more.
 */
export function Rail({ groups, tab, onPage, onGroup, dots, counts = {}, astraColor: color }: Props) {
  const astraColor = color || '#8fa8ff'
  const rail = useRef<HTMLElement>(null)
  const lit = useRef<HTMLSpanElement>(null)
  const active = groups.find((g) => g.pages.includes(tab))?.id
  const lastGroup = useRef(active)

  useLayoutEffect(() => {
    const el = rail.current
    const hl = lit.current
    if (!el || !hl) return
    // scroll the active label clear of the fades, measured on screen and scaled back like placeLit
    const reveal = () => {
      if (active === 'astra') return
      const b = el.querySelector<HTMLElement>('.rail-pg.on')
      const c = b?.parentElement
      if (!b || !c) return
      const s = el.getBoundingClientRect().width / el.offsetWidth || 1
      const q = b.getBoundingClientRect()
      const v = c.getBoundingClientRect()
      if (q.left < v.left + FADE) c.scrollLeft -= (v.left + FADE - q.left) / s
      else if (q.right > v.right - FADE) c.scrollLeft += (q.right - v.right + FADE) / s
    }
    const place = () => {
      placeLit(el, hl, active === 'astra')
    }
    if (lastGroup.current === active) {
      reveal()
      place()
      return
    }
    lastGroup.current = active
    hl.classList.add('follow')
    const end = performance.now() + OPEN_MS
    let raf = 0
    const loop = () => {
      reveal()
      place()
      if (performance.now() < end) raf = requestAnimationFrame(loop)
      else hl.classList.remove('follow')
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [tab, active, groups])

  return (
    <nav
      className={`rail ${groups.length > 6 ? 'tight' : ''}`}
      ref={rail}
      aria-label="Pages"
      style={{ ['--astra' as string]: astraColor, ['--astra-ink' as string]: inkOn(astraColor) }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className={`rail-lit ${active === 'astra' ? 'is-astra' : ''}`} ref={lit} />
      {groups.map((g) => {
        const news = g.pages.filter((p) => counts[p])
        const total = news.reduce((a, p) => a + counts[p]!.n, 0)
        // the icon says where it came from and how much: "People: Friends 2, Groups 1"
        const what = news.map((p) => `${SHORT[p]} ${counts[p]!.n}`).join(', ')
        return (
        <div key={g.id} className={`rail-g ${g.id === active ? 'on' : ''} ${g.id === 'astra' ? 'is-astra' : ''}`}>
          <button className="rail-ic" aria-label={total ? `${g.title}: ${what}` : g.title} title={total ? `${g.title}: ${what}` : g.title} onClick={() => onGroup(g.id)}>
            <GroupIcon id={g.id} size={16} />
            {total > 0 ? <i className="rail-count">{short(total)}</i> : dots.includes(g.id) && <i className="rail-dot" />}
          </button>
          <span className="rail-pages">
            <span
              className="rail-in"
              onScroll={() => rail.current && lit.current && placeLit(rail.current, lit.current)}
              // a mouse wheel scrolls the labels sideways
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
              }}
            >
              {g.pages.map((p) => (
                <button
                  key={p}
                  className={`rail-pg ${p === tab ? 'on' : ''}`}
                  aria-current={p === tab ? 'page' : undefined}
                  aria-label={counts[p] ? `${SHORT[p]}: ${counts[p]!.label}` : undefined}
                  title={counts[p]?.label}
                  tabIndex={g.id === active ? 0 : -1}
                  onClick={() => onPage(p)}
                >
                  {SHORT[p]}
                  {counts[p] && <i className="rail-pg-count">{short(counts[p]!.n)}</i>}
                </button>
              ))}
            </span>
          </span>
        </div>
        )
      })}
    </nav>
  )
}
