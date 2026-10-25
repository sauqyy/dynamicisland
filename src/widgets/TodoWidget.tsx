import { useState } from 'react'
import { AnimatePresence, Reorder, motion } from 'motion/react'
import type { Todo } from '../types'

interface Props {
  todos: Todo[]
  setTodos: (t: Todo[]) => void
}

export function TodoWidget({ todos, setTodos }: Props) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setTodos([{ id: Date.now(), text, done: false }, ...todos])
    setDraft('')
  }

  return (
    <div className="todo" onClick={(e) => e.stopPropagation()}>
      <input
        className="todo-input"
        placeholder="Add a task and press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') add()
        }}
      />
      <Reorder.Group axis="y" values={todos} onReorder={setTodos} className="todo-list">
        <AnimatePresence initial={false}>
          {todos.map((t) => (
            <Reorder.Item
              key={t.id}
              value={t}
              className={`todo-item ${t.done ? 'done' : ''}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <motion.button
                className="check"
                aria-label="Toggle done"
                animate={t.done ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                onClick={() => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
              >
                {t.done ? '✓' : ''}
              </motion.button>
              <span className="todo-text">{t.text}</span>
              <button
                className="x"
                aria-label="Delete"
                onClick={() => setTodos(todos.filter((x) => x.id !== t.id))}
              >
                ×
              </button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
        {!todos.length && <div className="empty">Nothing to do 🎉</div>}
      </Reorder.Group>
    </div>
  )
}
