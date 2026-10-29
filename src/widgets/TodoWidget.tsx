import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import { play } from 'cuelume'
import { invoke } from '@tauri-apps/api/core'
import { CalendarClock, Check, ChevronDown, FileText, Folder, Link2, ListChecks, Paperclip } from 'lucide-react'
import type { Todo, TodoAttachment } from '../types'
import { fmtSize, openPath } from '../lib/files'
import { dueLabel } from '../lib/deadlines'
import { DuePicker, whenText } from './DuePicker'
import { IS_TAURI } from '../lib/useMedia'

interface Props {
  todos: Todo[]
  setTodos: (t: Todo[]) => void
  /** the to-do whose details are open, so files dropped on the island are attached to it (see App) */
  onOpen?: (id: number | null) => void
}

const H = 3600_000

/** "scele.cs.ui.ac.id/course" as https://scele.cs.ui.ac.id/course; null when it isn't a web address. */
function asUrl(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`)
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null
  } catch {
    return null
  }
}

function openAttachment(a: TodoAttachment) {
  if (a.path) openPath(a.path)
  else if (a.url) {
    if (IS_TAURI) invoke('open_url', { url: a.url }).catch(() => {})
    else window.open(a.url, '_blank', 'noopener')
  }
}

/** overdue, due within a day, or later */
const dueTone = (due: number, now: number) => (due < now ? 'late' : due - now <= 24 * H ? 'soon' : '')

/** A description box that grows with what's written in it, up to a few lines. */
function Note({ value, onChange, placeholder, onKeyDown }: { value: string; onChange: (v: string) => void; placeholder: string; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="todo-input todo-note"
      placeholder={placeholder}
      aria-label="Description"
      rows={1}
      value={value}
      data-cuelume-type
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        onKeyDown?.(e)
      }}
    />
  )
}

/**
 * Adding a task is a small form: the title alone is enough (Enter adds it), and as soon as you
 * click in or start typing, a description and a due date open up under it.
 */
function NewTodo({ onAdd }: { onAdd: (t: Omit<Todo, 'id' | 'done'>) => void }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState<number | undefined>(undefined)
  const [focused, setFocused] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const open = focused || Boolean(text || note || due !== undefined)

  const add = () => {
    const title = text.trim()
    if (!title) return
    play('tap')
    onAdd({ text: title, note: note.trim() || undefined, due })
    setText('')
    setNote('')
    setDue(undefined)
  }

  return (
    <div
      ref={box}
      className={`todo-new ${open ? 'open' : ''}`}
      onFocus={() => setFocused(true)}
      // still inside the form (moving from the title to the date): stay open
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && setFocused(false)}
    >
      <input
        className="todo-input todo-new-title"
        placeholder="Add a task"
        value={text}
        data-cuelume-type
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') add()
          if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
        }}
      />
      <div className="todo-fold" inert={!open}>
        <div className="todo-fold-in">
          <Note
            value={note}
            onChange={setNote}
            placeholder="Description (optional)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add()
            }}
          />
          <DuePicker
            value={due}
            onChange={setDue}
            aside={
              <button className="pill-btn todo-new-add" disabled={!text.trim()} data-cuelume-tap onClick={add}>
                Add task
              </button>
            }
          />
        </div>
      </div>
    </div>
  )
}

export function TodoWidget({ todos, setTodos, onOpen }: Props) {
  // one to-do's details open at a time
  const [open, setOpen] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // braces, not an expression: an effect may only return its clean-up
  useEffect(() => {
    onOpen?.(open)
  }, [open, onOpen])
  useEffect(
    () => () => {
      onOpen?.(null)
    },
    [onOpen],
  )
  // due dates say "in 3h", so the page keeps time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const patch = (id: number, p: Partial<Todo>) => setTodos(todos.map((x) => (x.id === id ? { ...x, ...p } : x)))

  return (
    <div className="todo" onClick={(e) => e.stopPropagation()}>
      <NewTodo onAdd={(t) => setTodos([...todos, { id: Date.now(), done: false, ...t }])} />
      <Reorder.Group axis="y" values={todos} onReorder={setTodos} className="todo-list">
        <AnimatePresence initial={false}>
          {todos.map((t) => (
            <TodoRow
              key={t.id}
              t={t}
              now={now}
              open={open === t.id}
              onOpenChange={(on) => setOpen(on ? t.id : null)}
              onPatch={(p) => patch(t.id, p)}
              onDelete={() => {
                if (open === t.id) setOpen(null)
                setTodos(todos.filter((x) => x.id !== t.id))
              }}
            />
          ))}
        </AnimatePresence>
        {!todos.length && (
          <div className="empty">
            <ListChecks size={20} strokeWidth={1.7} aria-hidden />
            Nothing to do
          </div>
        )}
      </Reorder.Group>
    </div>
  )
}

/**
 * One to-do. The whole row can be dragged to reorder it; a click on the circle or the text (that
 * wasn't the end of a drag) ticks it off, and the arrow opens its details: description, due date,
 * links and files. Open, the row and its details read as one card.
 */
function TodoRow({ t, now, open, onOpenChange, onPatch, onDelete }: { t: Todo; now: number; open: boolean; onOpenChange: (on: boolean) => void; onPatch: (p: Partial<Todo>) => void; onDelete: () => void }) {
  const controls = useDragControls()
  // a drag ends with a click on whatever it started on: that click doesn't tick the to-do off
  const dragged = useRef(false)
  const [link, setLink] = useState('')
  const files = t.attachments ?? []
  const note = t.note?.trim() ?? ''

  const toggle = () => {
    if (dragged.current) return
    onPatch({ done: !t.done })
  }
  const addLink = () => {
    const url = asUrl(link)
    if (!url) return
    play('tap')
    const name = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    onPatch({ attachments: [...files, { id: `${url}#${Date.now()}`, name, url }] })
    setLink('')
  }

  return (
    <Reorder.Item
      value={t}
      // only where it is in the list animates, never its size: the details open with CSS, and a
      // size animation would stretch the row and its text while they do
      layout="position"
      dragListener={false}
      dragControls={controls}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={() => setTimeout(() => (dragged.current = false), 0)}
      className={`todo-item ${t.done ? 'done' : ''} ${open ? 'open' : ''}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      <div
        className="todo-row"
        onPointerDown={(e) => {
          // the arrow and delete buttons are only buttons; anywhere else on the row picks it up
          if ((e.target as HTMLElement).closest('.todo-more-btn, .x')) return
          controls.start(e)
        }}
      >
        <motion.button
          className="check"
          aria-label="Toggle done"
          aria-pressed={t.done}
          data-cuelume-toggle
          animate={t.done ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          onClick={toggle}
        >
          {t.done ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
        </motion.button>
        <span
          className="todo-main"
          role="button"
          tabIndex={0}
          aria-pressed={t.done}
          title={t.done ? 'Mark as not done' : 'Mark as done'}
          data-cuelume-toggle
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            e.stopPropagation()
            toggle()
          }}
        >
          <span className="todo-text">{t.text}</span>
          {(t.due !== undefined || (!open && (note || files.length > 0))) && (
            <small className="todo-meta">
              {t.due !== undefined && (
                <span className={`todo-due ${t.done ? '' : dueTone(t.due, now)}`} title={whenText(t.due, now)}>
                  <CalendarClock size={10} aria-hidden /> {t.done ? whenText(t.due, now) : `${whenText(t.due, now)} · ${dueLabel(t.due, now)}`}
                </span>
              )}
              {!open && files.length > 0 && (
                <span className="todo-clip">
                  <Paperclip size={10} aria-hidden /> {files.length}
                </span>
              )}
              {!open && note && <span className="todo-note-line">{note.split('\n')[0]}</span>}
            </small>
          )}
        </span>
        <button
          className="todo-more-btn"
          aria-label={open ? 'Hide details' : 'Show details'}
          aria-expanded={open}
          title={open ? 'Hide details' : 'Description, due date and attachments'}
          data-cuelume-open
          data-cuelume-emphasis="subtle"
          onClick={() => onOpenChange(!open)}
        >
          <ChevronDown size={14} aria-hidden />
        </button>
        <button className="x" aria-label="Delete" data-cuelume-close data-cuelume-emphasis="subtle" onClick={onDelete}>
          ×
        </button>
      </div>

      {/* always there, folded to no height when closed: the CSS eases it open, so the rows below glide down with it */}
      <div className="todo-fold" inert={!open}>
        <div className="todo-fold-in todo-more">
          <Note value={t.note ?? ''} onChange={(v) => onPatch({ note: v })} placeholder="Add a description" />
          <DuePicker value={t.due} onChange={(due) => onPatch({ due })} />
          {files.length > 0 && (
            <ul className="todo-files">
              {files.map((a) => (
                <li key={a.id} className="todo-file">
                  <button className="todo-file-open" title={a.path ?? a.url} data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => openAttachment(a)}>
                    {a.url ? <Link2 size={13} aria-hidden /> : a.isDir ? <Folder size={13} aria-hidden /> : <FileText size={13} aria-hidden />}
                    <span>{a.name}</span>
                    {a.size ? <small>{fmtSize(a.size)}</small> : null}
                  </button>
                  <button
                    className="x"
                    aria-label={`Remove ${a.name}`}
                    data-cuelume-close
                    data-cuelume-emphasis="subtle"
                    onClick={() => onPatch({ attachments: files.filter((x) => x.id !== a.id) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="todo-link-add">
            <Link2 size={13} aria-hidden />
            <input
              className="todo-input"
              placeholder="Paste a link and press Enter"
              aria-label="Add a link"
              value={link}
              data-cuelume-type
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') addLink()
              }}
            />
          </span>
          <small className="todo-hint">
            <Paperclip size={10} aria-hidden /> Drop files on the island to attach them to this task.
          </small>
        </div>
      </div>
    </Reorder.Item>
  )
}
