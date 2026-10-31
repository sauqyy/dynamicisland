import { useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import { ChevronRight, NotebookPen, Plus, Trash2 } from 'lucide-react'

const KEY = 'di.notesList'
/** the single scratchpad from before there were several notes: it becomes the first one */
const OLD_KEY = 'di.notes'

interface Note {
  id: string
  title: string
  text: string
  open?: boolean
}

function load(): Note[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (Array.isArray(saved)) return saved
    const old = localStorage.getItem(OLD_KEY)
    if (old?.trim()) return [{ id: `n${Date.now()}`, title: 'Notes', text: old, open: true }]
  } catch {
    /* ignore */
  }
  return []
}

/** Notes: each one has a label, folds shut to just that label, and opens to write in. */
export function NotesWidget() {
  const [notes, setNotes] = useState<Note[]>(load)
  // a note that was just made: its label is ready to type
  const [naming, setNaming] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(notes))
      } catch {
        /* ignore */
      }
    }, 300)
    return () => clearTimeout(id)
  }, [notes])

  const patch = (id: string, p: Partial<Note>) => setNotes((all) => all.map((n) => (n.id === id ? { ...n, ...p } : n)))
  const add = () => {
    play('tap')
    const n = { id: `n${Date.now()}`, title: '', text: '', open: true }
    setNotes([n, ...notes])
    setNaming(n.id)
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="notes notes-list" ref={listRef} onClick={(e) => e.stopPropagation()}>
      <button className="todo-group-new" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={add}>
        <Plus size={13} aria-hidden /> New note
      </button>
      {notes.map((n) => {
        const first = n.text.trim().split('\n')[0]
        return (
          <section key={n.id} className={`note-card ${n.open ? 'open' : ''}`}>
            <div className="note-head">
              <button
                className="todo-group-fold note-fold"
                aria-expanded={Boolean(n.open)}
                aria-label={n.open ? 'Fold the note' : 'Open the note'}
                data-cuelume-open
                data-cuelume-emphasis="subtle"
                onClick={() => patch(n.id, { open: !n.open })}
              >
                <ChevronRight size={14} aria-hidden />
              </button>
              <input
                className="note-title"
                value={n.title}
                placeholder="Untitled note"
                aria-label="Note label"
                autoFocus={naming === n.id}
                maxLength={60}
                spellCheck={false}
                data-cuelume-type
                onBlur={() => setNaming(null)}
                onChange={(e) => patch(n.id, { title: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    // Enter from the label goes on to writing the note
                    patch(n.id, { open: true })
                    ;(e.currentTarget.closest('.note-card')?.querySelector('.note-body') as HTMLTextAreaElement | null)?.focus()
                  }
                }}
              />
              {!n.open && first && <span className="note-peek">{first}</span>}
              <button className="todo-group-btn" title="Delete the note" aria-label={`Delete ${n.title || 'the note'}`} data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setNotes(notes.filter((x) => x.id !== n.id))}>
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
            <div className="todo-fold" inert={!n.open}>
              <div className="todo-fold-in">
                <textarea className="note-body" placeholder="Jot something down…" value={n.text} data-cuelume-type onChange={(e) => patch(n.id, { text: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
              </div>
            </div>
          </section>
        )
      })}
      {!notes.length && (
        <div className="empty">
          <NotebookPen size={20} strokeWidth={1.7} aria-hidden />
          No notes yet
        </div>
      )}
    </div>
  )
}
