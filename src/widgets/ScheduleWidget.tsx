import { useEffect, useState } from 'react'
import { play } from 'cuelume'
import { CalendarDays } from 'lucide-react'
import { minutes, type Slot } from '../lib/schedule'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday-first index of today */
const today = () => (new Date().getDay() + 6) % 7

interface Props {
  slots: Slot[]
  setSlots: (s: Slot[]) => void
  fullscreen: boolean
  onFullscreen: (on: boolean) => void
}

/** Your week, Monday to Sunday. One day at a time in the card; all seven side by side in fullscreen. */
export function ScheduleWidget({ slots, setSlots, fullscreen, onFullscreen }: Props) {
  const [sel, setSel] = useState(today)
  const [title, setTitle] = useState('')
  const [room, setRoom] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [clock, setClock] = useState(() => new Date())

  // the "now" highlight follows the minute
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const add = () => {
    const text = title.trim()
    if (!text || !start || !end) return
    play('tap')
    setSlots([...slots, { id: Date.now(), day: sel, start, end, title: text, room: room.trim() || undefined }])
    setTitle('')
    setRoom('')
  }

  const remove = (id: number) => setSlots(slots.filter((s) => s.id !== id))
  const daySlots = (day: number) => slots.filter((s) => s.day === day).sort((a, b) => minutes(a.start) - minutes(b.start))
  const nowMin = clock.getHours() * 60 + clock.getMinutes()
  const isNow = (s: Slot) => s.day === today() && minutes(s.start) <= nowMin && nowMin < minutes(s.end)

  const renderSlot = (s: Slot) => (
    <li key={s.id} className={`wk-slot ${isNow(s) ? 'now' : ''}`}>
      <span className="wk-time">
        {s.start}
        <small>{s.end}</small>
      </span>
      <span className="wk-title">
        {s.title}
        {s.room && <small className="wk-room">{s.room}</small>}
      </span>
      <button className="x" aria-label="Delete" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => remove(s.id)}>
        ×
      </button>
    </li>
  )

  const form = (
    <div className="wk-add">
      <input
        className="todo-input"
        placeholder={`Add to ${DAYS[sel]}`}
        value={title}
        data-cuelume-type
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') add()
        }}
      />
      <input
        className="todo-input wk-room-in"
        placeholder="Room"
        value={room}
        data-cuelume-type
        onChange={(e) => setRoom(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') add()
        }}
      />
      <input className="todo-input wk-clock" type="time" value={start} aria-label="Start" onChange={(e) => setStart(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <input className="todo-input wk-clock" type="time" value={end} aria-label="End" onChange={(e) => setEnd(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <button className="pill-btn dl-go" data-cuelume-tap onClick={add} disabled={!title.trim()}>
        Add
      </button>
    </div>
  )

  const fullBtn = (
    <button
      className="chip wk-full"
      aria-pressed={fullscreen}
      data-cuelume-toggle
      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      onClick={() => onFullscreen(!fullscreen)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  )

  return (
    <div className={`wk ${fullscreen ? 'wk-fs' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="wk-top">
        <div className="wk-days" role="tablist" aria-label="Day">
          {DAYS.map((d, i) => (
            <button
              key={d}
              role="tab"
              aria-selected={sel === i}
              className={`wk-day ${sel === i ? 'on' : ''} ${today() === i ? 'today' : ''}`}
              data-cuelume-tap
              onClick={() => setSel(i)}
            >
              {fullscreen ? d : d[0]}
              {slots.some((s) => s.day === i) && <i />}
            </button>
          ))}
        </div>
        {fullBtn}
      </div>
      {form}
      {fullscreen ? (
        <div className="wk-week">
          {DAYS.map((d, i) => (
            <section key={d} className={`wk-col ${sel === i ? 'sel' : ''} ${today() === i ? 'today' : ''}`} onClick={() => setSel(i)}>
              <h4>{d}</h4>
              <ul>{daySlots(i).map(renderSlot)}</ul>
              {!daySlots(i).length && <span className="wk-free">Free</span>}
            </section>
          ))}
        </div>
      ) : (
        <ul className="wk-list">
          {daySlots(sel).map(renderSlot)}
          {!daySlots(sel).length && (
            <div className="empty">
              <CalendarDays size={20} strokeWidth={1.7} aria-hidden />
              Nothing on {DAYS[sel]}
            </div>
          )}
        </ul>
      )}
    </div>
  )
}
