import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { play } from 'cuelume'
import { CalendarClock, Check } from 'lucide-react'
import { dueLabel, toInputValue, urgency, type Deadline } from '../lib/deadlines'

interface Props {
  deadlines: Deadline[]
  setDeadlines: (d: Deadline[]) => void
  now: number
}

/** Things with a date on them. The nearest open one can be shown in the pill (Settings → Pill). */
export function DeadlinesWidget({ deadlines, setDeadlines, now }: Props) {
  const [title, setTitle] = useState('')
  // tomorrow at 09:00 until you pick something else
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return toInputValue(d.getTime())
  })

  const add = () => {
    const text = title.trim()
    const due = new Date(when).getTime()
    if (!text || Number.isNaN(due)) return
    play('tap')
    setDeadlines([...deadlines, { id: Date.now(), title: text, due, done: false }])
    setTitle('')
  }

  // open ones by date, finished ones sink to the bottom
  const sorted = [...deadlines].sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due)

  return (
    <div className="dl" onClick={(e) => e.stopPropagation()}>
      <div className="dl-add">
        <input
          className="todo-input"
          placeholder="Add a deadline"
          value={title}
          data-cuelume-type
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') add()
          }}
        />
        <input
          className="todo-input dl-when"
          type="datetime-local"
          value={when}
          aria-label="Due date and time"
          onChange={(e) => setWhen(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') add()
          }}
        />
        <button className="pill-btn dl-go" data-cuelume-tap onClick={add} disabled={!title.trim()}>
          Add
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
                <small>{new Date(d.due).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </span>
              <span className="dl-left">{d.done ? 'done' : dueLabel(d.due, now)}</span>
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
            No deadlines
          </div>
        )}
      </ul>
    </div>
  )
}
