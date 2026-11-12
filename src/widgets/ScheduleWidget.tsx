import { useEffect, useState } from 'react'
import { play } from 'cuelume'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { minutes, type Slot } from '../lib/schedule'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Quick lengths for a class, in minutes. */
const LENGTHS = [50, 100, 150]
const clockText = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

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
  const [adding, setAdding] = useState(false)
  // the days a new class repeats on; it starts as the day you are looking at
  const [days, setDays] = useState<number[]>([])
  const [clock, setClock] = useState(() => new Date())

  // the "now" highlight follows the minute
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const length = minutes(end) - minutes(start)
  const valid = Boolean(title.trim()) && days.length > 0 && length > 0

  const openForm = () => {
    setDays([sel])
    setAdding(true)
  }
  const add = () => {
    if (!valid) return
    play('tap')
    const id = Date.now()
    setSlots([...slots, ...days.map((d, i) => ({ id: id + i, day: d, start, end, title: title.trim(), room: room.trim() || undefined }))])
    if (!days.includes(sel)) setSel(days[0])
    setTitle('')
    setRoom('')
    setAdding(false)
  }
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()))

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

  const summary =
    length <= 0
      ? 'Pick an end time after the start.'
      : days.length === 0
        ? 'Pick at least one day.'
        : `${days.map((d) => DAYS[d]).join(', ')}, ${start} to ${end}`

  if (adding) {
    return (
      <motion.div className="fm" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
        <div className="fm-c">
          <span className="fm-h">Class name</span>
          <input
            className="fm-in lg"
            placeholder="Basis Data"
            aria-label="Class name"
            autoFocus
            value={title}
            maxLength={60}
            data-cuelume-type
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <span className="fm-h">Room</span>
          <input
            className="fm-in"
            placeholder="A3.04"
            aria-label="Room"
            value={room}
            maxLength={30}
            data-cuelume-type
            onChange={(e) => setRoom(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
        </div>
        <div className="fm-c">
          <span className="fm-h">Days</span>
          <div className="fm-days">
            {DAYS.map((d, i) => (
              <button key={d} className={`fm-chip ${days.includes(i) ? 'on' : ''}`} aria-pressed={days.includes(i)} data-cuelume-select onClick={() => toggleDay(i)}>
                {d}
              </button>
            ))}
          </div>
          <span className="fm-h">Starts at, ends at</span>
          <div className="fm-row">
            <input className="fm-in time" type="time" value={start} aria-label="Start" onChange={(e) => setStart(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            <input className="fm-in time" type="time" value={end} aria-label="End" onChange={(e) => setEnd(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <div className="fm-chips">
            {LENGTHS.map((m) => (
              <button key={m} className={`fm-chip ${length === m ? 'on' : ''}`} aria-pressed={length === m} data-cuelume-select onClick={() => setEnd(clockText(minutes(start) + m))}>
                {m} min
              </button>
            ))}
          </div>
        </div>
        <div className="fm-c">
          <span className={`fm-sum ${length <= 0 || days.length === 0 ? 'bad' : ''}`}>{summary}</span>
          <button className="fm-btn" disabled={!valid} data-cuelume-tap onClick={add}>
            Add class
          </button>
          <button className="fm-btn ghost" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      </motion.div>
    )
  }

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
        <button className="fm-add" data-cuelume-tap onClick={openForm}>
          <Plus size={13} strokeWidth={2.6} aria-hidden />
          Add class
        </button>
        {fullBtn}
      </div>
      <div className="wk-week">
        {DAYS.map((d, i) => (
          <section key={d} className={`wk-col ${sel === i ? 'sel' : ''} ${today() === i ? 'today' : ''}`} onClick={() => setSel(i)}>
            <h4>{d}</h4>
            <ul>{daySlots(i).map(renderSlot)}</ul>
            {!daySlots(i).length && <span className="wk-free">Free</span>}
          </section>
        ))}
      </div>
    </div>
  )
}
