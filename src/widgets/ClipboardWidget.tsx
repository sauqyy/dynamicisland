import type { ClipItem } from '../lib/useClipboard'

interface Props {
  items: ClipItem[]
  paused: boolean
  mask: boolean
  onCopy: (text: string) => void
  onRemove: (text: string) => void
}

export function ClipboardWidget({ items, paused, mask, onCopy, onRemove }: Props) {
  return (
    <div className="clips" onClick={(e) => e.stopPropagation()}>
      {paused && <div className="clip-note">History paused. Nothing new is being recorded.</div>}
      {items.length ? (
        items.map(({ text }) => (
          <div key={text} className="clip-row">
            <button
              className={`clip ${mask ? 'masked' : ''}`}
              title="Click to copy again"
              onClick={() => onCopy(text)}
            >
              {text.replace(/\s+/g, ' ')}
            </button>
            <button className="x" aria-label="Remove" onClick={() => onRemove(text)}>
              ×
            </button>
          </div>
        ))
      ) : (
        !paused && <div className="empty">Copy some text and it will show up here</div>
      )}
    </div>
  )
}
