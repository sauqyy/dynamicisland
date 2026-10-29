import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { play } from 'cuelume'
import { CalendarClock, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react'
import { DEFAULT_TIME, parseTime, parseWhen } from '../lib/when'
import { dueLabel } from '../lib/deadlines'

const DAY = 86_400_000
const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0)
const at = (day: number, h: number, m: number) => new Date(new Date(day).setHours(h, m, 0, 0)).getTime()
/** The Monday of the week `t` is in. */
const mondayOf = (t: number) => startOf(t) - ((new Date(t).getDay() + 6) % 7) * DAY
const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** "Today 23:59", "Tomorrow 09:00", "Fri 6 Nov 17:00" */
export function whenText(t: number, now = Date.now()) {
  const d = Math.round((startOf(t) - startOf(now)) / DAY)
  const date = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return `${date} ${hm(t)}`
}

/** The common answers, from now: later today, tonight, tomorrow morning and night, Friday, next week. */
function quickPicks(now: number): { label: string; at: number }[] {
  const today = startOf(now)
  const wd = new Date(now).getDay()
  const out: { label: string; at: number }[] = []
  const inHours = Math.ceil((now + 3 * 3600_000) / (15 * 60_000)) * 15 * 60_000
  if (startOf(inHours) === today) out.push({ label: 'In 3 hours', at: inHours })
  if (at(today, 23, 59) - now > 3600_000) out.push({ label: 'Tonight', at: at(today, 23, 59) })
  out.push({ label: 'Tomorrow 9:00', at: at(today + DAY, 9, 0) })
  out.push({ label: 'Tomorrow night', at: at(today + DAY, 23, 59) })
  // the coming Friday, unless that's today or tomorrow (already covered)
  const toFri = (5 - wd + 7) % 7
  if (toFri > 1) out.push({ label: 'Friday', at: at(today + toFri * DAY, 23, 59) })
  out.push({ label: 'Next week', at: at(mondayOf(now) + 7 * DAY, 9, 0) })
  return out
}

const TIMES: [number, number][] = [
  [9, 0],
  [12, 0],
  [17, 0],
  [21, 0],
  [23, 59],
]
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface Props {
  value: number | undefined
  onChange: (due: number | undefined) => void
  /** can be taken off (a to-do's due date); a deadline always has one */
  optional?: boolean
  /** shown at the end of the row with the date, like the form's Add button */
  aside?: ReactNode
}

/**
 * Picking when something is due, inside the card rather than in a pop-up: type it ("fri 5pm",
 * "besok jam 9", "6 nov"), tap a common answer, or pick a day of the next two weeks and a time.
 * Closed, it's one line saying when it's due.
 */
/** The nearest element that scrolls, so opening the picker can bring it into view there and nowhere else. */
function scroller(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function DuePicker({ value, onChange, optional = true, aside }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  // once it has opened (the fold takes 0.3 s), scroll the page so the whole picker shows
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => {
      const el = root.current
      const box = scroller(el)
      if (!el || !box) return
      const r = el.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      if (r.bottom > b.bottom) box.scrollBy({ top: Math.min(r.bottom - b.bottom + 8, r.top - b.top), behavior: 'smooth' })
    }, 320)
    return () => clearTimeout(id)
  }, [open])
  const [typed, setTyped] = useState('')
  const [now] = useState(() => Date.now())
  // the first of the two weeks shown: the one with the due date in it, or this one
  const [week, setWeek] = useState(() => mondayOf(value ?? Date.now()))
  const [timeText, setTimeText] = useState('')

  const parsed = useMemo(() => (typed.trim() ? parseWhen(typed, Date.now()) : null), [typed])
  const picks = useMemo(() => quickPicks(Date.now()), [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (t: number | undefined) => {
    onChange(t)
    if (t !== undefined) setWeek(mondayOf(t))
  }
  const pickDay = (day: number) => {
    play('tap', { emphasis: 'subtle' })
    const h = value !== undefined ? new Date(value).getHours() : DEFAULT_TIME.h
    const m = value !== undefined ? new Date(value).getMinutes() : DEFAULT_TIME.m
    set(at(day, h, m))
  }
  // a time with no day yet: today, or tomorrow once it has passed
  const pickTime = (h: number, m: number) => {
    play('tap', { emphasis: 'subtle' })
    if (value !== undefined) return set(at(startOf(value), h, m))
    const t = at(startOf(Date.now()), h, m)
    set(t > Date.now() ? t : at(startOf(Date.now()) + DAY, h, m))
  }
  const applyTyped = () => {
    if (parsed === null) return
    play('tap')
    set(parsed)
    setTyped('')
    setOpen(false)
  }
  const nudge = (minutes: number) => {
    const base = value ?? at(startOf(Date.now()), DEFAULT_TIME.h, DEFAULT_TIME.m)
    set(base + minutes * 60_000)
  }

  const days = Array.from({ length: 14 }, (_, i) => week + i * DAY)
  const label = (() => {
    const a = new Date(days[0])
    const b = new Date(days[13])
    const f = (d: Date, month: boolean) => d.toLocaleDateString([], month ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
    return `${f(a, a.getMonth() !== b.getMonth())} – ${f(b, true)}`
  })()

  return (
    <div
      ref={root}
      className={`dp ${open ? 'open' : ''}`}
      // arrow keys move the time and the page, not the island's pages
      onKeyDown={(e) => {
        if (e.key.startsWith('Arrow') || e.key === 'Escape') e.stopPropagation()
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <div className="dp-row">
        {value === undefined ? (
          <button className={`todo-due-add ${open ? 'on' : ''}`} aria-expanded={open} data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => setOpen(!open)}>
            <CalendarClock size={13} aria-hidden /> Add a due date
          </button>
        ) : (
          <span className="dp-value">
            <button className={`dp-pill ${open ? 'on' : ''}`} aria-expanded={open} title="Change the due date" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => setOpen(!open)}>
              <CalendarClock size={13} aria-hidden />
              <b>{whenText(value, now)}</b>
              <small>{dueLabel(value, Date.now())}</small>
            </button>
            {optional && (
              <button
                className="x"
                aria-label="Remove the due date"
                data-cuelume-close
                data-cuelume-emphasis="subtle"
                onClick={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                ×
              </button>
            )}
          </span>
        )}
        {aside}
      </div>

      <div className={`todo-fold ${open ? 'on' : ''}`} inert={!open}>
        <div className="todo-fold-in dp-panel">
          <label className="dp-type">
            <input
              className="todo-input"
              placeholder='Type it: "fri 5pm", "besok jam 9", "6 nov"'
              aria-label="Type when it's due"
              value={typed}
              data-cuelume-type
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') applyTyped()
                if (e.key === 'Escape') setOpen(false)
              }}
            />
            {parsed !== null && (
              <button className="dp-use" title="Use this date" data-cuelume-tap onClick={applyTyped}>
                <CornerDownLeft size={12} aria-hidden />
              </button>
            )}
          </label>
          {typed.trim() && (
            <small className={`dp-read ${parsed === null ? 'bad' : ''}`}>
              {parsed !== null ? `${whenText(parsed, Date.now())} · ${dueLabel(parsed, Date.now())}` : 'Not a date yet. Try "tomorrow 17:00" or "jumat sore".'}
            </small>
          )}

          <div className="dp-chips">
            {picks.map((p) => (
              <button key={p.label} className={`dp-chip ${value === p.at ? 'on' : ''}`} title={whenText(p.at, Date.now())} data-cuelume-select onClick={() => (play('tap', { emphasis: 'subtle' }), set(p.at))}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="dp-cal">
            <div className="dp-cal-head">
              <button className="dp-nav" aria-label="Two weeks earlier" disabled={week <= mondayOf(Date.now())} data-cuelume-tap data-cuelume-emphasis="subtle" onClick={() => setWeek(week - 14 * DAY)}>
                <ChevronLeft size={14} aria-hidden />
              </button>
              <span>{label}</span>
              <button className="dp-nav" aria-label="Two weeks later" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={() => setWeek(week + 14 * DAY)}>
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>
            <div className="dp-grid" role="grid">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="dp-wd" aria-hidden>
                  {w}
                </span>
              ))}
              {days.map((d) => {
                const past = d < startOf(Date.now())
                const chosen = value !== undefined && startOf(value) === d
                const today = d === startOf(Date.now())
                const first = new Date(d).getDate() === 1
                return (
                  <button
                    key={d}
                    className={`dp-day ${chosen ? 'on' : ''} ${today ? 'today' : ''} ${past ? 'past' : ''}`}
                    disabled={past}
                    aria-pressed={chosen}
                    aria-label={new Date(d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                    data-cuelume-select
                    onClick={() => pickDay(d)}
                  >
                    {first ? new Date(d).toLocaleDateString([], { month: 'short' }) : new Date(d).getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="dp-times">
            {TIMES.map(([h, m]) => {
              const on = value !== undefined && new Date(value).getHours() === h && new Date(value).getMinutes() === m
              return (
                <button key={`${h}:${m}`} className={`dp-chip ${on ? 'on' : ''}`} data-cuelume-select onClick={() => pickTime(h, m)}>
                  {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                </button>
              )
            })}
            <input
              className="todo-input dp-time"
              inputMode="numeric"
              aria-label="Time (arrow keys move it by 15 minutes)"
              title="Type a time like 1730 or 5pm; arrow keys move it by 15 minutes"
              placeholder={value !== undefined ? hm(value) : 'Time'}
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              onBlur={() => {
                const t = parseTime(timeText)
                if (t) pickTime(t.h, t.m)
                setTimeText('')
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  nudge(e.key === 'ArrowUp' ? 15 : -15)
                }
              }}
            />
          </div>

          <div className="dp-foot">
            <button className="pill-btn dp-done" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
