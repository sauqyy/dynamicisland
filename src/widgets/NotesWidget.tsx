import { useEffect, useState } from 'react'

const KEY = 'di.notes'

function load() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** A scratchpad that remembers its text. */
export function NotesWidget() {
  const [text, setText] = useState(load)

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, text)
      } catch {
        /* ignore */
      }
    }, 300)
    return () => clearTimeout(id)
  }, [text])

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
    </div>
  )
}
