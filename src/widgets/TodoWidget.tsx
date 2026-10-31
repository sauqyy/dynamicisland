import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import { play } from 'cuelume'
import { invoke } from '@tauri-apps/api/core'
import { CalendarClock, Check, ChevronDown, ChevronRight, FileText, Folder, FolderPlus, Link2, ListChecks, Paperclip, Plus, Trash2 } from 'lucide-react'
import type { Todo, TodoAttachment, TodoGroup } from '../types'
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
type DropTarget = { kind: 'todo'; id: number } | { kind: 'group'; id: string } | { kind: 'out'; id: '' }
const GROUPS_KEY = 'di.todoGroups'

function loadGroups(): TodoGroup[] {
  try {
    const g = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')
    return Array.isArray(g) ? g : []
  } catch {
    return []
  }
}

/** the groups, kept on this computer next to the to-dos */
function useGroups() {
  const [groups, setGroups] = useState<TodoGroup[]>(loadGroups)
  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
    } catch {
      /* ignore */
    }
  }, [groups])
  return [groups, setGroups] as const
}

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
function NewTodo({ onAdd, groups, group, setGroup }: { onAdd: (t: Omit<Todo, 'id' | 'done'>) => void; groups: TodoGroup[]; group: string; setGroup: (g: string) => void }) {
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
    onAdd({ text: title, note: note.trim() || undefined, due, group: groups.some((g) => g.id === group) ? group : undefined })
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
          {groups.length > 0 && <GroupPick groups={groups} value={group} onPick={setGroup} />}
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

/** Which group a task goes in: a row of chips, "None" first. */
function GroupPick({ groups, value, onPick }: { groups: TodoGroup[]; value: string; onPick: (g: string) => void }) {
  return (
    <div className="todo-group-pick" role="radiogroup" aria-label="Group">
      <Folder size={12} aria-hidden />
      {[{ id: '', name: 'None' }, ...groups].map((g) => (
        <button key={g.id} role="radio" aria-checked={value === g.id} className={`todo-group-chip ${value === g.id ? 'on' : ''}`} data-cuelume-select onClick={() => onPick(g.id)}>
          {g.name}
        </button>
      ))}
    </div>
  )
}

export function TodoWidget({ todos, setTodos, onOpen }: Props) {
  // one to-do's details open at a time
  const [open, setOpen] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [groups, setGroups] = useGroups()
  // the group new tasks go in: the last one picked, or the one whose + was pressed
  const [addTo, setAddTo] = useState('')
  // a group that was just made: its name is ready to type
  const [naming, setNaming] = useState<string | null>(null)
  const newRef = useRef<HTMLDivElement>(null)

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
  const known = new Set(groups.map((g) => g.id))
  // a task whose group is gone counts as loose
  const groupOf = (t: Todo) => (t.group && known.has(t.group) ? t.group : '')
  const patchGroup = (id: string, p: Partial<TodoGroup>) => setGroups((all) => all.map((g) => (g.id === id ? { ...g, ...p } : g)))
  const newGroup = () => {
    play('tap')
    const g = { id: `g${Date.now()}`, name: 'New group' }
    setGroups([...groups, g])
    setNaming(g.id)
  }
  // dragging a task onto the middle of another one (or onto a group's name) files them together
  const [dropOn, setDropOn] = useState<DropTarget | null>(null)
  const dropRef = useRef<DropTarget | null>(null)
  const aim = (d: DropTarget | null) => {
    if (d?.kind === dropRef.current?.kind && d?.id === dropRef.current?.id) return
    dropRef.current = d
    setDropOn(d)
  }
  // the order only changes once the pointer is well past the middle of the task it is moving over: without this
  // the list swapped them as soon as they touched, and the task slid away before it could be dropped on
  const mayReorder = useRef(false)
  const dragAt = (self: number, x: number, y: number) => {
    mayReorder.current = false
    for (const el of document.elementsFromPoint(x, y)) {
      if ((el as HTMLElement).closest('[data-ungroup]')) return aim({ kind: 'out', id: '' })
      const head = (el as HTMLElement).closest<HTMLElement>('[data-group-head]')
      if (head) return aim({ kind: 'group', id: head.dataset.groupHead! })
      const item = (el as HTMLElement).closest<HTMLElement>('[data-todo-id]')
      if (!item || Number(item.dataset.todoId) === self) continue
      const id = Number(item.dataset.todoId)
      const r = item.getBoundingClientRect()
      // how far through it the pointer is, counted from the side the drag came in from
      const below = todos.findIndex((t) => t.id === id) > todos.findIndex((t) => t.id === self)
      const through = below ? (y - r.top) / r.height : (r.bottom - y) / r.height
      // the first fifth: nothing yet; most of it: group together; the far quarter: move past it
      if (through > 0.75) {
        mayReorder.current = true
        return aim(null)
      }
      return aim(through > 0.2 ? { kind: 'todo', id } : null)
    }
    // over empty space (above or below the list): just ordering
    mayReorder.current = true
    aim(null)
  }
  // the task being dragged, when it is in a group: the place to drop it out of the group shows while it is
  const [draggingOut, setDraggingOut] = useState(false)
  // what the list was before the last drag-to-group, for a few seconds, so it can be taken back
  const [undo, setUndo] = useState<{ text: string; todos: Todo[]; groups: TodoGroup[] } | null>(null)
  useEffect(() => {
    if (!undo) return
    const t = window.setTimeout(() => setUndo(null), 6000)
    return () => window.clearTimeout(t)
  }, [undo])

  const dropped = (self: number) => {
    const d = dropRef.current
    aim(null)
    setDraggingOut(false)
    if (!d) return
    const before = { todos, groups }
    const into = (group: string | undefined) => setTodos(todos.map((t) => (t.id === self ? { ...t, group } : t)))
    const nameOf = (id: string) => groups.find((g) => g.id === id)?.name || 'the group'
    if (d.kind === 'out') {
      into(undefined)
      setUndo({ text: 'Taken out of the group', ...before })
      return
    }
    if (d.kind === 'group') {
      into(d.id)
      patchGroup(d.id, { collapsed: false })
      setUndo({ text: `Moved to ${nameOf(d.id)}`, ...before })
      return
    }
    const target = todos.find((t) => t.id === d.id)
    if (!target) return
    const g = groupOf(target)
    if (g) {
      into(g)
      setUndo({ text: `Moved to ${nameOf(g)}`, ...before })
      return
    }
    // two loose tasks: a new group with both, its name ready to type
    play('tap')
    const made = { id: `g${Date.now()}`, name: 'New group' }
    setGroups([...groups, made])
    setTodos(todos.map((t) => (t.id === self || t.id === target.id ? { ...t, group: made.id } : t)))
    setNaming(made.id)
    setUndo({ text: 'Grouped', ...before })
  }

  const removeGroup = (g: TodoGroup) => {
    // its tasks are kept: they go back to the loose ones
    setGroups(groups.filter((x) => x.id !== g.id))
    setTodos(todos.map((t) => (t.group === g.id ? { ...t, group: undefined } : t)))
    if (addTo === g.id) setAddTo('')
  }

  const rows = (list: Todo[], sectionId: string) => (
    <Reorder.Group
      axis="y"
      values={list}
      // only this section's order changed: the others keep theirs
      // aimed at another task to group with, or not yet past it: hold the order still, or the target would slide away
      onReorder={(next) => mayReorder.current && !dropRef.current && setTodos([...todos.filter((t) => groupOf(t) !== sectionId), ...next])}
      className="todo-list"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <TodoRow
            key={t.id}
            t={t}
            now={now}
            groups={groups}
            target={dropOn?.kind === 'todo' && dropOn.id === t.id}
            onDragAt={(x, y) => dragAt(t.id, x, y)}
            onDropped={() => dropped(t.id)}
            onPickedUp={() => setDraggingOut(Boolean(groupOf(t)))}
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
    </Reorder.Group>
  )

  const loose = todos.filter((t) => !groupOf(t))

  return (
    <div className="todo" onClick={(e) => e.stopPropagation()}>
      <div ref={newRef}>
        <NewTodo
          groups={groups}
          group={addTo}
          setGroup={setAddTo}
          onAdd={(t) => {
            setTodos([...todos, { id: Date.now(), done: false, ...t }])
            // the group it went into opens, so the new task is seen
            if (t.group) patchGroup(t.group, { collapsed: false })
          }}
        />
      </div>
      {rows(loose, '')}
      {draggingOut && (
        <div className={`todo-ungroup-zone ${dropOn?.kind === 'out' ? 'drop-target' : ''}`} data-ungroup>
          Drop here to take it out of the group
        </div>
      )}
      {groups.map((g) => {
        const list = todos.filter((t) => groupOf(t) === g.id)
        const finished = list.filter((t) => t.done).length
        return (
          <section key={g.id} className={`todo-group ${g.collapsed ? 'collapsed' : ''}`}>
            <div className={`todo-group-head ${dropOn?.kind === 'group' && dropOn.id === g.id ? 'drop-target' : ''}`} data-group-head={g.id}>
              <button
                className="todo-group-fold"
                aria-expanded={!g.collapsed}
                aria-label={g.collapsed ? `Show ${g.name}` : `Hide ${g.name}`}
                data-cuelume-open
                data-cuelume-emphasis="subtle"
                onClick={() => patchGroup(g.id, { collapsed: !g.collapsed })}
              >
                <ChevronRight size={14} aria-hidden />
              </button>
              <input
                className="todo-group-name"
                value={g.name}
                aria-label="Group name"
                autoFocus={naming === g.id}
                onFocus={(e) => naming === g.id && e.target.select()}
                onBlur={() => {
                  setNaming(null)
                  if (!g.name.trim()) patchGroup(g.id, { name: 'Untitled' })
                }}
                maxLength={40}
                spellCheck={false}
                data-cuelume-type
                onChange={(e) => patchGroup(g.id, { name: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
                }}
              />
              {list.length > 0 && (
                <span className="todo-group-count" title={`${finished} of ${list.length} done`}>
                  {finished}/{list.length}
                </span>
              )}
              <button
                className="todo-group-btn"
                title={`Add a task to ${g.name}`}
                aria-label={`Add a task to ${g.name}`}
                data-cuelume-tap
                data-cuelume-emphasis="subtle"
                onClick={() => {
                  setAddTo(g.id)
                  newRef.current?.querySelector<HTMLInputElement>('.todo-new-title')?.focus()
                }}
              >
                <Plus size={13} aria-hidden />
              </button>
              <button
                className="todo-group-btn"
                title={list.length ? 'Remove the group (its tasks are kept)' : 'Remove the group'}
                aria-label={`Remove ${g.name}`}
                data-cuelume-close
                data-cuelume-emphasis="subtle"
                onClick={() => removeGroup(g)}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
            {/* folded with CSS, like a task's details */}
            <div className="todo-fold" inert={g.collapsed}>
              <div className="todo-fold-in">{list.length ? rows(list, g.id) : <small className="todo-group-empty">No tasks yet. Press + to add one</small>}</div>
            </div>
          </section>
        )
      })}
      {!todos.length && !groups.length && (
        <div className="empty">
          <ListChecks size={20} strokeWidth={1.7} aria-hidden />
          Nothing to do
        </div>
      )}
      <AnimatePresence>
        {undo && (
          <motion.div className="todo-undo" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <span>{undo.text}</span>
            <button
              data-cuelume-tap
              onClick={() => {
                setTodos(undo.todos)
                setGroups(undo.groups)
                setNaming(null)
                setUndo(null)
              }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="todo-group-new" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={newGroup}>
        <FolderPlus size={13} aria-hidden /> New group
      </button>
    </div>
  )
}

/**
 * One to-do. The whole row can be dragged to reorder it; a click on the circle or the text (that
 * wasn't the end of a drag) ticks it off, and the arrow opens its details: description, due date,
 * links and files. Open, the row and its details read as one card.
 */
function TodoRow({
  t,
  now,
  groups,
  target,
  onDragAt,
  onDropped,
  onPickedUp,
  open,
  onOpenChange,
  onPatch,
  onDelete,
}: {
  t: Todo
  now: number
  groups: TodoGroup[]
  /** another task is being dragged onto this one */
  target: boolean
  onDragAt: (x: number, y: number) => void
  onDropped: () => void
  onPickedUp: () => void
  open: boolean; onOpenChange: (on: boolean) => void; onPatch: (p: Partial<Todo>) => void; onDelete: () => void }) {
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
      onDragStart={() => {
        dragged.current = true
        onPickedUp()
      }}
      onDrag={(e) => onDragAt((e as PointerEvent).clientX, (e as PointerEvent).clientY)}
      onDragEnd={() => {
        onDropped()
        setTimeout(() => (dragged.current = false), 0)
      }}
      data-todo-id={t.id}
      className={`todo-item ${t.done ? 'done' : ''} ${open ? 'open' : ''} ${target ? 'drop-target' : ''}`}
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
          {groups.length > 0 && <GroupPick groups={groups} value={t.group && groups.some((g) => g.id === t.group) ? t.group : ''} onPick={(g) => onPatch({ group: g || undefined })} />}
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
