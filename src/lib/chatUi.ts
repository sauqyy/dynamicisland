import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Keeps a chat's message list where the reader is. At the bottom (reading the latest messages) it stays at the
 * bottom as the list changes size, which is what going fullscreen does: the list grows or shrinks and used to be
 * left scrolled up. Scrolled up on purpose, it is left alone. `deps` change when a message arrives or is sent,
 * and that always brings the newest message into view.
 */
export function useStickToBottom(end: RefObject<HTMLElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    // the list element can be replaced (a group's info panel swaps it), so this is set up again with `deps`
    const el = end.current?.parentElement
    if (!el) return
    let pinned = true
    const down = () => {
      el.scrollTop = el.scrollHeight
    }
    const onScroll = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    }
    // the card growing to fullscreen (or back) while the reader is at the bottom: follow it
    const watch = new ResizeObserver(() => {
      if (pinned) down()
    })
    watch.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    down()
    return () => {
      watch.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, ...deps])
}

const DRAFTS_KEY = 'di.chatDrafts'

function load(): Record<string, string> {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}')
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
  } catch {
    return {}
  }
}

/** what is typed and not yet sent, per chat: kept for the session and on this computer, so leaving a chat does not lose it */
const drafts: Record<string, string> = load()
let saveTimer = 0
function save() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      const kept = Object.fromEntries(Object.entries(drafts).filter(([, v]) => v.trim()))
      if (Object.keys(kept).length) localStorage.setItem(DRAFTS_KEY, JSON.stringify(kept))
      else localStorage.removeItem(DRAFTS_KEY)
    } catch {
      /* ignore */
    }
  }, 300)
}

/**
 * The message being written in one chat. `key` is unique to the person and the chat (a friend, or a group); each chat
 * is its own component (keyed by it), so this only ever reads one.
 */
export function useChatDraft(key: string): [string, (v: string) => void] {
  const [draft, setDraftState] = useState(() => drafts[key] ?? '')
  const setDraft = useCallback(
    (v: string) => {
      setDraftState(v)
      if (v) drafts[key] = v
      else delete drafts[key]
      save()
    },
    [key],
  )
  return [draft, setDraft]
}

/** Drafts are written on the way out too, so closing the app straight after typing keeps them. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      const kept = Object.fromEntries(Object.entries(drafts).filter(([, v]) => v.trim()))
      if (Object.keys(kept).length) localStorage.setItem(DRAFTS_KEY, JSON.stringify(kept))
      else localStorage.removeItem(DRAFTS_KEY)
    } catch {
      /* ignore */
    }
  })
}
