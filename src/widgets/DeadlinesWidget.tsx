import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { play } from '../lib/sound'
import { CalendarClock, Check, Play, Plus } from 'lucide-react'
import { dueLabel, toDateValue, urgency, type Deadline } from '../lib/deadlines'

interface Props {
  deadlines: Deadline[]
  setDeadlines: (d: Deadline[]) => void
  now: number
  /** one tap: start a focus session on this deadline */
  onStart: (d: Deadline) => void
  /** the deadline a focus session is running for right now */
  studyingId?: number
  /** course names to pick from, taken from the schedule */
  courses?: string[]
}

/** Things with a date on them. The nearest open one can be shown in the pill (Settings → Pill). */
export function DeadlinesWidget({ deadlines, setDeadlines, now, onStart, studyingId, courses = [] }: Props) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [course, setCourse] = useState('')
  const day = (n: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + n)
    return toDateValue(d.getTime())
  }
  // tomorrow at 09:00 until you pick something else
  const [date, setDate] = useState(() => day(1))
  const [time, setTime] = useState('09:00')

  const due = new Date(`${date}T${time || '00:00'}`).getTime()
  const valid = Boolean(title.trim()) && !Number.isNaN(due)

  const add = () => {
    if (!valid) return
    play('tap')
    setDeadlines([...deadlines, { id: Date.now(), title: title.trim(), course: course || undefined, due, done: false }])
    setTitle('')
    setCourse('')
    setAdding(false)
  }

  const quick = [
    ['Today', 0],
    ['Tomorrow', 1],
    [new Date(now + 3 * 86_400_000).toLocaleDateString([], { weekday: 'long' }), 3],
    ['Next week', 7],
  ] as const
  const summary = Number.isNaN(due) ? 'Pick a date' : `${new Date(due).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, ${time}`
  const openCount = deadlines.filter((d) => !d.done).length
  const todayCount = deadlines.filter((d) => !d.done && new Date(d.due).toDateString() === new Date(now).toDateString()).length

  if (adding) {
    return (
      <motion.div className="fm" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
        <div className="fm-c">
          <span className="fm-h">What is due?</span>
          <input
            className="fm-in lg"
            placeholder="Lab 7, linked lists"
            aria-label="Deadline title"
            autoFocus
            value={title}
            maxLength={80}
            data-cuelume-type
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          {courses.length > 0 && (
            <>
              <span className="fm-h">Course</span>
              <div className="fm-chips">
                {courses.slice(0, 5).map((c) => (
                  <button key={c} className={`fm-chip ${course === c ? 'on' : ''}`} aria-pressed={course === c} data-cuelume-select onClick={() => setCourse(course === c ? '' : c)}>
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="fm-c">
          <span className="fm-h">When</span>
          <div className="fm-chips">
            {quick.map(([label, n]) => (
              <button key={n} className={`fm-chip ${date === day(n) ? 'on' : ''}`} aria-pressed={date === day(n)} data-cuelume-select onClick={() => setDate(day(n))}>
                {label}
              </button>
            ))}
          </div>
          <div className="fm-row">
            <input className="fm-in" type="date" value={date} aria-label="Due date" onChange={(e) => setDate(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            <input className="fm-in time" type="time" value={time} aria-label="Due time" onChange={(e) => setTime(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <span className="fm-sum">{summary}</span>
        </div>
        <div className="fm-c">
          <button className="fm-btn" disabled={!valid} data-cuelume-tap onClick={add}>
            Add deadline
          </button>
          <button className="fm-btn ghost" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      </motion.div>
    )
  }

  // open ones by date, finished ones sink to the bottom
  const sorted = [...deadlines].sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due)

  return (
    <div className="dl" onClick={(e) => e.stopPropagation()}>
      <div className="dl-bar">
        <span className="dl-count">
          {openCount} open{todayCount ? `, ${todayCount} due today` : ''}
        </span>
        <button className="fm-add" data-cuelume-tap onClick={() => setAdding(true)}>
          <Plus size={13} strokeWidth={2.6} aria-hidden />
          Add deadline
        </button>
      </div>
      <ul className="dl-list">
        <AnimatePresence initial={false}>
          {sorted.map((d) => (
            <motion.li
              key={d.id}
              layout
              className={`dl-item ${d.done ? 'done' : ''} u-${d.done ? 'ok' : urgency(d.due, now)}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <motion.button
                className="check"
                aria-label="Toggle done"
                aria-pressed={d.done}
                data-cuelume-toggle
                animate={d.done ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                onClick={() => setDeadlines(deadlines.map((x) => (x.id === d.id ? { ...x, done: !x.done } : x)))}
              >
                {d.done ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
              </motion.button>
              <span className="dl-text">
                <b>{d.title}</b>
                <small>{d.course ? `${d.course}, ` : ''}{new Date(d.due).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </span>
              <span className="dl-left">{d.done ? 'done' : dueLabel(d.due, now)}</span>
              {!d.done && (
                <button
                  className={`dl-start ${studyingId === d.id ? 'on' : ''}`}
                  aria-label={`Start working on ${d.title}`}
                  title="Start a focus session"
                  data-cuelume-tap
                  disabled={studyingId === d.id}
                  onClick={() => onStart(d)}
                >
                  <Play size={11} strokeWidth={2.6} fill="currentColor" aria-hidden />
                </button>
              )}
              <button
                className="x"
                aria-label="Delete"
                data-cuelume-close
                data-cuelume-emphasis="subtle"
                onClick={() => setDeadlines(deadlines.filter((x) => x.id !== d.id))}
              >
                ×
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {!deadlines.length && (
          <div className="empty">
            <CalendarClock size={20} strokeWidth={1.7} aria-hidden />
            No deadlines yet. Press Add deadline to start.
          </div>
        )}
      </ul>
    </div>
  )
}
