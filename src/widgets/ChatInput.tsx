import { useEffect, useLayoutEffect, useRef } from 'react'

interface Props {
  value: string
  placeholder: string
  onChange: (v: string) => void
  /** Enter sends; Shift+Enter starts a new line */
  onSend: () => void
}

/** The message box: grows with what you type (up to four lines), Enter sends, Shift+Enter breaks the line. */
export function ChatInput({ value, placeholder, onChange, onSend }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  // the box can be measured while the card is still growing (narrow, so its placeholder wraps): measure again at the real width
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let w = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === w) return
      w = el.clientWidth
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <textarea
      ref={ref}
      className="todo-input chat-input"
      rows={1}
      placeholder={placeholder}
      value={value}
      data-cuelume-type
      maxLength={2000}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onSend()
        }
      }}
    />
  )
}
