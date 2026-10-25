interface Props {
  items: string[]
  onCopy: (text: string) => void
}

export function ClipboardWidget({ items, onCopy }: Props) {
  return (
    <div className="clips" onClick={(e) => e.stopPropagation()}>
      {items.length ? (
        items.map((text) => (
          <button key={text} className="clip" title="Click to copy again" onClick={() => onCopy(text)}>
            {text.replace(/\s+/g, ' ')}
          </button>
        ))
      ) : (
        <div className="empty">Copy some text and it will show up here</div>
      )}
    </div>
  )
}
