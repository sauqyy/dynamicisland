import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { play } from 'cuelume'
import { CalendarClock, Check, Play } from 'lucide-react'
import { dueLabel, urgency, type Deadline } from '../lib/deadlines'
import { DuePicker } from './DuePicker'

interface Props {
  deadlines: Deadline[]
  setDeadlines: (d: Deadline[]) => void
  now: number
  /** one tap: start a focus session on this deadline */
  onStart: (d: Deadline) => void
  /** the deadline a focus session is running for right now */
  studyingId?: number
}

/** The form for adding a deadline: what, and when (tomorrow night until you pick something else). */
export function AddDeadline({ onAdd }: { onAdd: (title: string, due: number) => void }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.setHours(23, 59, 0, 0)
  })

  const add = () => {
    const text = title.trim()
    if (!text) return
    play('tap')
    onAdd(text, due)
    setTitle('')
  }

  return (
    <div className="dl-add-form">
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
        <button className="pill-btn dl-go" data-cuelume-tap onClick={add} disabled={!title.trim()}>
          Add
        </button>
      </div>
      {/* a deadline always has a date: the picker can change it but not take it off */}
      <DuePicker value={due} onChange={(d) => d !== undefined && setDue(d)} optional={false} />
    </div>
  )
}

/** Things with a date on them. The nearest open one can be shown in the pill (Settings → Pill). */
export function DeadlinesWidget({ deadlines, setDeadlines, now, onStart, studyingId }: Props) {

  // open ones by date, finished ones sink to the bottom
  const sorted = [...deadlines].sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due)

  return (
    <div className="dl" onClick={(e) => e.stopPropagation()}>
      <AddDeadline onAdd={(title, due) => setDeadlines([...deadlines, { id: Date.now(), title, due, done: false }])} />
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
            No deadlines
          </div>
        )}
      </ul>
    </div>
  )
}
