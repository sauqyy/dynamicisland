import { useEffect, useState } from 'react'

const KEY = 'di.notes'

function load() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** A scratchpad that remembers its text, with a small status column beside it. */
export function NotesWidget() {
  const [text, setText] = useState(load)
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    setSaved(false)
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, text)
      } catch {
        /* ignore */
      }
      setSaved(true)
    }, 300)
    return () => clearTimeout(id)
  }, [text])

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="notes" onClick={(e) => e.stopPropagation()}>
      <textarea
        className="notes-input"
        placeholder="Jot something down…"
        value={text}
        data-cuelume-type
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="notes-side">
        <div className="notes-state">{saved ? 'Saved' : 'Saving…'}</div>
        <div className="notes-count">
          {words} {words === 1 ? 'word' : 'words'}
        </div>
        <div className="notes-hint">Ctrl+Shift+N opens notes from anywhere.</div>
      </div>
    </div>
  )
}
