import { useMemo, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Sun } from 'lucide-react'
import type { Meeting, SceleState } from '../lib/useScele'
import { dueLabel, type Deadline as OwnDeadline } from '../lib/deadlines'
import type { Slot } from '../lib/schedule'
import { fmt } from './MediaWidget'
import type { Tab, TimerState, Todo } from '../types'

interface Props {
  now: number
  /** SCELE, once Campus is unlocked; null before */
  scele: SceleState | null
  /** the user's own deadlines */
  deadlines: OwnDeadline[]
  todos: Todo[]
  setTodos: (t: Todo[]) => void
  /** the user's own weekly schedule */
  slots: Slot[]
  timer: TimerState | null
  /** the pages that can be opened from here (hidden ones can't) */
  pages: Tab[]
  go: (t: Tab) => void
  /** connecting Universitas Indonesia, until it's done: shown first (see CampusSetup) */
  setup?: ReactNode
}

const H = 3600_000
/** How far ahead Due soon looks: today and tomorrow. */
const SOON_MS = 48 * H
/** At most this many rows per section; the rest are a tap away on their page. */
const ROWS = 4

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const dayWord = (t: number, now: number) => {
  const day = (x: number) => new Date(x).setHours(0, 0, 0, 0)
  const d = Math.round((day(t) - day(now)) / (24 * H))
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}
/** "Room 2.2301", but "Lab A3.02 (Gd. Baru)" as it is (as Classes says it). */
const roomText = (room: string) => (/^(?:room|ruang|lab|laboratorium|aula|hall)\b/i.test(room) ? room : `Room ${room}`)

type Soon = { key: string; title: string; from: string; due: number; open: () => void }

/**
 * The day in one place: the next class, what's due soon, open to-dos, today's schedule and a
 * running timer, each a tap away from its own page. Sections with nothing in them are left out.
 */
export function TodayWidget({ now, scele, deadlines, todos, setTodos, slots, timer, pages, go, setup }: Props) {
  const can = (t: Tab) => pages.includes(t)
  const duePage: Tab = scele && can('deadlines') ? 'deadlines' : 'deadlist'

  const next = useMemo<Meeting | undefined>(() => (scele ? scele.upcoming(now, 7).find((m) => m.end > now && m.kind !== 'off') : undefined), [scele, now])

  const soon = useMemo<Soon[]>(() => {
    const mine: Soon[] = deadlines
      .filter((d) => !d.done && d.due < now + SOON_MS)
      .map((d) => ({ key: `o${d.id}`, title: d.title, from: 'Yours', due: d.due, open: () => go(duePage) }))
    const campus: Soon[] = (scele?.deadlines ?? [])
      .filter((d) => d.submission !== 'submitted' && d.due < now + SOON_MS)
      .map((d) => ({
        key: `s${d.id}`,
        title: d.name,
        from: d.submission === 'draft' ? `${d.course} · draft, not submitted` : d.course,
        due: d.due,
        open: () => go(duePage),
      }))
    return [...campus, ...mine].sort((a, b) => a.due - b.due)
  }, [deadlines, scele, now, duePage, go])

  // open to-dos with a due date first, soonest first, then the rest in their own order
  const open = todos.filter((t) => !t.done).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
  // the schedule's blocks for today that haven't ended; read again with the clock, so a block
  // added on Schedule shows up here
  const blocks = useMemo(() => {
    const day = (new Date(now).getDay() + 6) % 7
    const hm = new Date(now).getHours() * 60 + new Date(now).getMinutes()
    const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
    return slots
      .filter((s) => s.day === day && mins(s.end) > hm)
      .sort((a, b) => mins(a.start) - mins(b.start))
  }, [now, slots])

  const left = timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0
  const empty = !next && !soon.length && !open.length && !blocks.length && !timer

  if (empty && setup)
    return (
      <div className="sc-list today" onClick={(e) => e.stopPropagation()}>
        {setup}
      </div>
    )
  if (empty)
    return (
      <div className="empty today-empty" onClick={(e) => e.stopPropagation()}>
        <Sun size={20} strokeWidth={1.7} aria-hidden />
        Nothing on today
        <small>Classes, deadlines, to-dos and your schedule show up here.</small>
      </div>
    )

  const head = (label: string, page: Tab, count?: number) => (
    <h4>
      {label}
      {can(page) && (
        <button className="chip" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => go(page)}>
          {count && count > ROWS ? `All ${count}` : 'Open'}
        </button>
      )}
    </h4>
  )

  return (
    <div className="sc-list today" onClick={(e) => e.stopPropagation()}>
      {setup}
      {timer && (
        <section>
          {head('Timer', 'timer')}
          <button className="sc-row" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => go('timer')}>
            <i className="sc-dot info" />
            <span className="sc-main">
              <b>{timer.goal || 'Timer running'}</b>
              <small>{fmt(left)} left</small>
            </span>
          </button>
        </section>
      )}

      {next && (
        <section>
          {head(next.start <= now ? 'Class now' : 'Next class', 'classes')}
          <button className="sc-row" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => go('classes')} disabled={!can('classes')}>
            <i className={`sc-dot ${next.start <= now ? 'hot' : next.kind === 'exam' ? 'over' : 'info'}`} />
            <span className="sc-main">
              <b>{next.title}</b>
              <small>
                {[next.kind === 'exam' ? `Exam · ${next.topic}` : next.topic, next.slot.room ? roomText(next.slot.room) : ''].filter(Boolean).join(' · ') || 'Topic not listed on SCELE'}
              </small>
            </span>
            <span className="sc-when">
              <b>{next.start <= now ? `until ${time(next.end)}` : next.slot.start ? time(next.start) : 'Time not listed'}</b>
              <small>{dayWord(next.start, now)}</small>
            </span>
          </button>
        </section>
      )}

      {soon.length > 0 && (
        <section>
          {head('Due soon', duePage, soon.length)}
          {soon.slice(0, ROWS).map((d) => (
            <button key={d.key} className="sc-row" data-cuelume-open data-cuelume-emphasis="subtle" onClick={d.open}>
              <i className={`sc-dot ${d.due < now ? 'over' : d.due - now <= 3 * H ? 'hot' : d.due - now <= 24 * H ? 'warm' : ''}`} />
              <span className="sc-main">
                <b>{d.title}</b>
                <small>{d.from}</small>
              </span>
              <span className="sc-when">
                <b>{dueLabel(d.due, now)}</b>
                <small>
                  {dayWord(d.due, now)} {time(d.due)}
                </small>
              </span>
            </button>
          ))}
        </section>
      )}

      {open.length > 0 && (
        <section>
          {head('To-do', 'todo', open.length)}
          {open.slice(0, ROWS).map((t) => (
            <div key={t.id} className="sc-row today-todo">
              <motion.button
                className="check"
                aria-label={`Mark "${t.text}" as done`}
                data-cuelume-toggle
                whileTap={{ scale: 1.3 }}
                onClick={() => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: true } : x)))}
              >
                <Check size={11} strokeWidth={3} aria-hidden className="today-check" />
              </motion.button>
              <button className="sc-main today-todo-text" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => go('todo')} disabled={!can('todo')}>
                <b>{t.text}</b>
                {(t.due !== undefined || t.note?.trim()) && (
                  <small className={t.due !== undefined && t.due < now ? 'today-late' : ''}>
                    {[t.due !== undefined ? `Due ${dueLabel(t.due, now)}` : '', t.note?.trim().split('\n')[0] ?? ''].filter(Boolean).join(' · ')}
                  </small>
                )}
              </button>
            </div>
          ))}
        </section>
      )}

      {blocks.length > 0 && (
        <section>
          {head('Schedule', 'schedule', blocks.length)}
          {blocks.slice(0, ROWS).map((b) => (
            <button key={b.id} className="sc-row" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => go('schedule')} disabled={!can('schedule')}>
              <span className="sc-day">{b.start}</span>
              <span className="sc-main">
                <b>{b.title}</b>
                <small>until {b.end}</small>
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
