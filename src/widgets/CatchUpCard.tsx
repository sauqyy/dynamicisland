import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertIcon, alertTone } from '../island/AlertIcon'
import type { CatchUpDigest } from '../lib/useCatchUp'
import type { Meeting } from '../lib/useScele'
import type { Deadline as SceleDeadline } from '../lib/scele'
import { dueLabel, type Deadline as OwnDeadline } from '../lib/deadlines'
import type { Tab, Todo } from '../types'

/** Someone (or a group) who wrote while the user was away. */
export interface UnreadFrom {
  key: string
  who: string
  count: number
  /** opens the chat with this friend */
  chatWith?: string
  group?: boolean
}

interface Props {
  digest: CatchUpDigest
  /** the user's first name, if known */
  name: string
  now: number
  unread: UnreadFrom[]
  /** this term's classes from now on (Campus), and SCELE's deadlines */
  meetings: Meeting[]
  sceleDue: SceleDeadline[]
  ownDue: OwnDeadline[]
  todos: Todo[]
  onGo: (t: Tab) => void
  onChat: (friendId: string) => void
  onClose: () => void
  /** the height its content needs (layout px), so the island can be just as tall */
  onHeight?: (h: number) => void
  /** opens Today, when the build has it */
  onToday?: () => void
  /** a character beside the greeting (Lumi, in the Universitas Indonesia build) */
  mascot?: ReactNode
}

const H = 3600_000
/** Rows per section: the card shows everything at a glance, and the rest is a tap away. */
const NEEDS_MAX = 3
const NEW_MAX = 4

/** "Good morning" by the clock, and something warmer than "good night" for whoever is still up late. */
function greeting(t: number) {
  const h = new Date(t).getHours()
  if (h >= 4 && h < 11) return 'Good morning'
  if (h >= 11 && h < 18) return 'Good afternoon'
  if (h >= 18 && h < 22) return 'Good evening'
  return 'Late one tonight'
}

/** "Back to it, Demo." or, without a name, "Back to it." */
const named = (line: string, name: string, after = '') => `${line}${name ? `, ${name}` : ''}.${after ? ` ${after}` : ''}`

/** Welcome backs after time away from the keyboard: one of these, a different one from last time. */
const BACK_LINES = [
  'Welcome back',
  'So good to see you',
  'There you are',
  'Hope that break was a good one',
  'Missed you',
  'Ready when you are',
  'Right where you left off',
]
const LAST_LINE_KEY = 'di.catchup.lastLine'
/** A welcome back line, never the one shown last time. */
function pickBackLine() {
  let last = -1
  try {
    last = Number(localStorage.getItem(LAST_LINE_KEY) ?? -1)
  } catch {
    /* ignore */
  }
  // any of them the first time; after that, any but the last one
  const fresh = last >= 0 && last < BACK_LINES.length
  let i = Math.floor(Math.random() * (fresh ? BACK_LINES.length - 1 : BACK_LINES.length))
  if (fresh && i >= last) i += 1
  try {
    localStorage.setItem(LAST_LINE_KEY, String(i))
  } catch {
    /* ignore */
  }
  return BACK_LINES[i]
}

const DAY = 24 * 3600_000
/**
 * The title: away from the keyboard, a welcome back (or "All quiet" when nothing came in); back
 * after the computer was off, "It's been a few days" past two days, "Good morning … Here's where
 * things stand" on the first morning after, else the greeting the time of day calls for.
 */
function titleFor(digest: CatchUpDigest, name: string, now: number, quiet: boolean, backLine: string) {
  if (digest.kind === 'back') return quiet ? named('All calm while you were away', name) : named(backLine, name)
  if (now - digest.since >= 2 * DAY) return named('Welcome back', name, "It's been a few days, so here's what you missed.")
  const morning = new Date(now).getHours() >= 4 && new Date(now).getHours() < 11
  const newDay = new Date(digest.since).toDateString() !== new Date(now).toDateString()
  if (morning && newDay) return named('Good morning', name, "Hope you slept well. Here's your day.")
  return named(greeting(now), name)
}

/** "40 min", "2 h 14 min", "3 days" */
function span(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  const d = Math.round(h / 24)
  return `${d} day${d > 1 ? 's' : ''}`
}

/** "at 23:40", "yesterday at 23:40", "on Tue at 23:40", "on 3 Nov at 23:40" */
function when(t: number, now: number) {
  const day = (x: number) => new Date(x).setHours(0, 0, 0, 0)
  const d = Math.round((day(now) - day(t)) / (24 * H))
  const hm = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d === 0) return `at ${hm}`
  if (d === 1) return `yesterday at ${hm}`
  if (d < 7) return `on ${new Date(t).toLocaleDateString([], { weekday: 'short' })} at ${hm}`
  return `on ${new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${hm}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** "Zhillan", "Zhillan and Mira", "Zhillan, Mira and 2 others" */
const names = (who: string[]) => (who.length <= 2 ? who.join(' and ') : `${who.slice(0, 2).join(', ')} and ${plural(who.length - 2, 'other')}`)

type Row = { key: string; icon: string; text: string; sub?: string; meta?: string; tone?: string; go?: () => void }

/**
 * What needs the user soon, nearest first: the next class within 3 hours, and what's due within a
 * day (SCELE, their own deadlines, dated to-dos). Shared with App, which shows a welcome back with
 * nothing new only when something here needs them.
 */
export function needsYou(now: number, meetings: Meeting[], sceleDue: SceleDeadline[], ownDue: OwnDeadline[], todos: Todo[], onGo: (t: Tab) => void = () => {}): Row[] {
  const rows: (Row & { at: number })[] = []
  const next = meetings.find((m) => m.end > now && m.kind !== 'off' && m.start - now < 3 * H)
  if (next) {
    const hm = new Date(next.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    rows.push({
      key: 'class',
      at: next.start,
      icon: '🎓',
      text: next.title,
      sub: [next.kind === 'exam' ? 'Exam' : next.topic, next.slot.room].filter(Boolean).join(' · ') || undefined,
      meta: next.start <= now ? 'Now' : hm,
      tone: 'var(--accent)',
      go: () => onGo('classes'),
    })
  }
  const due = [
    ...sceleDue.filter((d) => d.submission !== 'submitted' && d.due > now && d.due - now < 24 * H).map((d) => ({ key: `s${d.id}`, text: d.name, sub: d.submission === 'draft' ? `${d.course} · still a draft` : d.course, due: d.due, tab: 'deadlines' as Tab })),
    ...ownDue.filter((d) => !d.done && d.due > now && d.due - now < 24 * H).map((d) => ({ key: `o${d.id}`, text: d.title, sub: 'Your deadline', due: d.due, tab: 'deadlines' as Tab })),
    ...todos.filter((t) => !t.done && t.due !== undefined && t.due > now && t.due - now < 24 * H).map((t) => ({ key: `t${t.id}`, text: t.text, sub: 'To-do', due: t.due!, tab: 'todo' as Tab })),
  ]
  for (const d of due)
    rows.push({ key: d.key, at: d.due, icon: '📅', text: d.text, sub: d.sub, meta: dueLabel(d.due, now).replace(/^in /, ''), tone: d.due - now <= 3 * H ? 'var(--danger)' : 'var(--warn)', go: () => onGo(d.tab) })
  return rows.sort((a, b) => a.at - b.at)
}

/**
 * The catch-up when the user comes back: a greeting after the computer was off or asleep ("Good
 * morning, Zhillan."), a welcome back after time away from the keyboard. Laid out to be read at a
 * glance, most pressing first:
 * - a summary line (how long, how much),
 * - Needs you: what's due within a day and a class about to start, with how long is left,
 * - New: what came in (announcements, materials, grades, the timer) and who wrote, one line each.
 * Every row is something real (a held alert, an unread chat, a class, a deadline), each shown once.
 */
export function CatchUpCard({ digest, name, now, unread, meetings, sceleDue, ownDue, todos, onGo, onChat, onClose, onHeight, onToday, mascot }: Props) {
  const hello = digest.kind === 'hello'
  // picked once, when the card opens
  const [backLine] = useState(pickBackLine)

  const needs = useMemo(() => needsYou(now, meetings, sceleDue, ownDue, todos, onGo), [meetings, sceleDue, ownDue, todos, now, onGo])

  // what came in: the held alerts, minus a deadline reminder already under Needs you, newest first;
  // and who wrote, as one row
  const fresh = useMemo<Row[]>(() => {
    const shown = needs.map((n) => n.text.toLowerCase())
    const rows: Row[] = [...digest.held]
      .reverse()
      .filter((a) => !(a.icon === '📅' && shown.some((t) => a.text.toLowerCase().includes(t))))
      .map((a, i) => ({ key: `h${i}`, icon: a.icon, text: a.text, sub: a.sub, tone: alertTone(a.icon), go: a.openTab ? () => onGo(a.openTab!) : undefined }))
    if (unread.length) {
      const total = unread.reduce((n, u) => n + u.count, 0)
      const one = unread.length === 1 ? unread[0] : null
      rows.unshift({
        key: 'messages',
        icon: '💬',
        text: names(unread.map((u) => u.who)),
        sub: plural(total, 'new message'),
        tone: 'var(--info)',
        go: one?.chatWith ? () => onChat(one.chatWith!) : () => onGo(one?.group ? 'groups' : 'friends'),
      })
    }
    return rows
  }, [digest.held, needs, unread, onChat, onGo])

  const title = titleFor(digest, name, now, fresh.length === 0, backLine)

  // the whole catch-up at a glance: how long, how much needs the user, how much is new
  const away = hello ? `Last here ${when(digest.since, now)}` : `Away for ${span(digest.until - digest.since)}`
  // nothing came in and nothing is due: say so kindly, not as an empty report
  const allClear = hello ? "Nothing new and nothing due today, so take it easy." : "Nothing new and nothing due today. You're all caught up."


  // a fade at the bottom when there's more than fits, so it's clear the list scrolls
  const body = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // as tall as the content: the header, every row (scrolled or not) and the button, with the gaps
  useLayoutEffect(() => {
    const el = root.current
    if (!el || !onHeight) return
    const cs = getComputedStyle(el)
    // each part's own height (the list's whole content, scrolled or not) with its margins
    const parts = [...el.children].map((c) => {
      const m = getComputedStyle(c)
      const h = c === body.current ? body.current.scrollHeight : (c as HTMLElement).offsetHeight
      return h + parseFloat(m.marginTop) + parseFloat(m.marginBottom)
    })
    const gaps = Math.max(0, parts.length - 1) * parseFloat(cs.rowGap || '0')
    onHeight(Math.ceil(parts.reduce((a, b) => a + b, 0) + gaps + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 2)
  }, [needs, fresh, onHeight])
  const [fades, setFades] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    // a few pixels short isn't "more": only a row or so hidden below fades the bottom
    const check = () => setFades(el.scrollTop + el.clientHeight < el.scrollHeight - 12)
    check()
    el.addEventListener('scroll', check, { passive: true })
    return () => el.removeEventListener('scroll', check)
  }, [needs, fresh])

  // "40 min away · 2 need you · 3 new", said as a sentence with the counts standing out
  const counts = [
    needs.length > 0 && (
      <span key="n">
        <b>{needs.length}</b> need{needs.length === 1 ? 's' : ''} you
      </span>
    ),
    fresh.length > 0 && (
      <span key="f">
        <b>{fresh.length}</b> new
      </span>
    ),
  ].filter(Boolean)

  const more = (n: number, go: () => void) =>
    n > 0 && (
      <button className="cu-more" data-cuelume-open data-cuelume-emphasis="subtle" onClick={go}>
        {n} more
      </button>
    )

  const nothing = !needs.length && !fresh.length
  return (
    <div ref={root} className="whatsnew catchup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <header className={`cu-head ${mascot ? 'has-lumi' : ''}`}>
        {mascot && <span className="cu-lumi">{mascot}</span>}
        <b className="cu-title">{title}</b>
        <p className="cu-sum">
          {away}
          {nothing && '. '}
          {nothing && allClear}
          {counts.map((c, i) => (
            <span key={i}>
              {' · '}
              {c}
            </span>
          ))}
        </p>
      </header>

      {!nothing && (
        <div ref={body} className={`cu-body ${fades ? 'fades' : ''}`}>
          {/* what needs the user, as an agenda: how long is left, then what */}
          {needs.length > 0 && (
            <ol className="cu-agenda" aria-label="Needs you">
              {needs.slice(0, NEEDS_MAX).map((r) => (
                <li key={r.key}>
                  <button className="cu-due" style={{ ['--tone' as string]: r.tone }} disabled={!r.go} data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => r.go?.()}>
                    <span className={`cu-time ${r.tone === 'var(--danger)' ? 'hot' : ''}`}>{r.meta}</span>
                    <span className="cu-what">
                      <b>{r.text}</b>
                      {r.sub && <small>{r.sub}</small>}
                    </span>
                  </button>
                </li>
              ))}
              {more(needs.length - NEEDS_MAX, () => onGo('deadlines'))}
            </ol>
          )}
          {/* what came in, one line each */}
          {fresh.length > 0 && (
            <ul className="cu-news" aria-label="New">
              {fresh.slice(0, NEW_MAX).map((r) => (
                <li key={r.key}>
                  <button className="cu-new" disabled={!r.go} data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => r.go?.()} title={r.sub ? `${r.text} · ${r.sub}` : r.text}>
                    <AlertIcon icon={r.icon} size={13} />
                    <b>{r.text}</b>
                    {r.sub && <small>{r.sub}</small>}
                  </button>
                </li>
              ))}
              {more(fresh.length - NEW_MAX, () => onGo('inbox'))}
            </ul>
          )}
        </div>
      )}

      <footer className="cu-foot">
        {onToday && (
          <button className="cu-link" data-cuelume-open data-cuelume-emphasis="subtle" onClick={onToday}>
            Open Today
          </button>
        )}
        <button className="pill-btn cu-done" data-cuelume-close onClick={onClose}>
          Got it
        </button>
      </footer>
    </div>
  )
}
