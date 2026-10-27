import type { ClipItem } from '../lib/useClipboard'

interface Props {
  items: ClipItem[]
  paused: boolean
  mask: boolean
  onCopy: (item: ClipItem) => void
  onRemove: (text: string) => void
}

export function ClipboardWidget({ items, paused, mask, onCopy, onRemove }: Props) {
  return (
    <div className="clips" onClick={(e) => e.stopPropagation()}>
      {paused && <div className="clip-note">History paused. Nothing new is being recorded.</div>}
      {items.length ? (
        items.map((item) => (
          <div key={item.text} className="clip-row">
            <button
              className={`clip ${mask ? 'masked' : ''}`}
              title="Click to copy again"
              onClick={() => onCopy(item)}
            >
              {item.image ? <img className="clip-img" src={item.image} alt="Copied image" /> : item.text.replace(/\s+/g, ' ')}
            </button>
            <button className="x" aria-label="Remove" onClick={() => onRemove(item.text)}>
              ×
            </button>
          </div>
        ))
      ) : (
        !paused && <div className="empty">Copy some text or an image and it will show up here</div>
      )}
    </div>
  )
}
