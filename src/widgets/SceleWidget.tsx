import { useEffect, useMemo, useRef, useState } from 'react'
import { play } from 'cuelume'
import { BookOpen, CalendarCheck, CalendarClock, ChevronDown, Clock, FileText, FolderOpen, Inbox, Lock, LogOut, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { browserUrl, courseTitle, dayName, openScele, relTime, syllabusLinks, type ClassSlot, type Deadline } from '../lib/scele'
import type { Meeting, SceleState } from '../lib/useScele'

interface Props {
  page: 'deadlines' | 'classes' | 'inbox'
  scele: SceleState
  now: number
  /** the SSO UI username verified on the Profile page; SCELE uses the same account */
  username: string
}

const H = 3600_000
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

export function SceleWidget({ page, scele, now, username }: Props) {
  if (scele.account === undefined) return <div className="scele center"><div className="timer-label">Loading SCELE…</div></div>
  if (!scele.account) return <SceleLogin scele={scele} username={username} />
  return (
    <div className="scele" onClick={(e) => e.stopPropagation()}>
      <SyncRow scele={scele} now={now} />
      {page === 'deadlines' && <Deadlines scele={scele} now={now} />}
      {page === 'classes' && <Classes scele={scele} now={now} />}
      {page === 'inbox' && <InboxPage scele={scele} now={now} />}
    </div>
  )
}

function SceleLogin({ scele, username }: { scele: SceleState; username: string }) {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    if (!pass || busy) return
    setBusy(true)
    setError(null)
    scele
      .login(pass)
      .then(() => play('success'))
      .catch((e) => {
        play('error')
        setError(typeof e === 'string' ? e : 'Sign-in failed')
      })
      .finally(() => {
        setBusy(false)
        setPass('')
      })
  }
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') submit()
  }
  return (
    <div className="scele center scele-login" onClick={(e) => e.stopPropagation()}>
      <div className="timer-label">Connect SCELE</div>
      <input className="todo-input" value={username} readOnly aria-label="SSO UI username" title="Verified with SSO UI" />
      <input className="todo-input" type="password" placeholder="SSO UI password" autoComplete="current-password" autoFocus value={pass} data-cuelume-type onChange={(e) => setPass(e.target.value)} onKeyDown={keys} />
      {error && <small className="sc-error">{error}</small>}
      <button className="pill-btn" disabled={busy || !pass} onClick={submit}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      <small className="sc-note">
        SCELE doesn't accept SSO sign-in from apps, so it needs your password once to issue a token. The password goes only to scele.cs.ui.ac.id; only the token is
        kept, on this computer.
      </small>
    </div>
  )
}

function SyncRow({ scele, now }: { scele: SceleState; now: number }) {
  return (
    <div className="sc-sync">
      <span>
        {scele.error ? (
          <span className="sc-error">{scele.error}</span>
        ) : scele.syncedAt ? (
          // the clock ticks every 15 s, so a sync can be a moment "ahead" of it
          `Synced ${now - scele.syncedAt < 60_000 ? 'just now' : relTime(scele.syncedAt, now)}`
        ) : (
          'Not synced yet'
        )}
      </span>
      <button className={`chip ${scele.syncing ? 'sc-spin' : ''}`} aria-label="Sync now" data-cuelume-tap data-cuelume-emphasis="subtle" disabled={scele.syncing} onClick={scele.refresh}>
        <RefreshCw size={11} aria-hidden /> Sync
      </button>
    </div>
  )
}

/** How pressing a deadline is: drives its dot colour. */
const urgency = (d: Deadline, now: number) => (d.due < now ? 'over' : d.due - now <= 3 * H ? 'hot' : d.due - now <= 24 * H ? 'warm' : '')

function DeadlineRow({ d, now }: { d: Deadline; now: number }) {
  return (
    <button className="sc-row" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => openScele(d.url)} title="Open in SCELE">
      <i className={`sc-dot ${urgency(d, now)}`} />
      <span className="sc-main">
        <b>{d.name}</b>
        <small>
          {d.course} · {d.module === 'quiz' ? 'Quiz' : d.module === 'assign' ? 'Assignment' : d.module || 'Activity'}
        </small>
      </span>
      <span className="sc-when">
        <b>{relTime(d.due, now)}</b>
        <small>
          {dayLabel(d.due)} {time(d.due)}
        </small>
      </span>
    </button>
  )
}

function Deadlines({ scele, now }: { scele: SceleState; now: number }) {
  const groups = useMemo(() => {
    const end = new Date(now)
    end.setHours(24, 0, 0, 0)
    const today = end.getTime()
    const sorted = [...scele.deadlines].sort((a, b) => a.due - b.due)
    return [
      { label: 'Overdue', items: sorted.filter((d) => d.due < now) },
      { label: 'Today', items: sorted.filter((d) => d.due >= now && d.due < today) },
      { label: 'Tomorrow', items: sorted.filter((d) => d.due >= today && d.due < today + 24 * H) },
      { label: 'This week', items: sorted.filter((d) => d.due >= today + 24 * H && d.due < today + 7 * 24 * H) },
      { label: 'Later', items: sorted.filter((d) => d.due >= today + 7 * 24 * H) },
    ].filter((g) => g.items.length)
  }, [scele.deadlines, now])
  if (!groups.length)
    return (
      <div className="empty">
        <CalendarCheck size={20} strokeWidth={1.7} aria-hidden />
        Nothing due in the next two weeks
      </div>
    )
  return (
    <div className="sc-list">
      {groups.map((g) => (
        <section key={g.label}>
          <h4>{g.label}</h4>
          {g.items.map((d) => (
            <DeadlineRow key={d.id} d={d} now={now} />
          ))}
        </section>
      ))}
    </div>
  )
}

/** How sure a topic is: said next to the document it came from. */
const CERTAINTY: Record<NonNullable<Meeting['from']>, { word: string; cls: 'dated' | 'week' }> = {
  timeline: { word: 'dated for this day', cls: 'dated' },
  'timeline-week': { word: "this week's entry", cls: 'week' },
  'outline-dated': { word: 'section dated this week', cls: 'dated' },
  'outline-week': { word: 'estimated from the week number', cls: 'week' },
}
/** Where a found class came from, as the rows say it. */
const SOURCE_NAME: Record<NonNullable<ClassSlot['source']>, string> = { slcm: 'SLCM study plan', page: 'course page', syllabus: 'syllabus', timeline: 'timeline' }

const DAY = 86_400_000
const dayStart = (t: number) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime()
const meetingKey = (m: Meeting) => `${m.slot.id}@${m.start}`
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()
/** A document's own name: "Lesson Plan - Statistics" of "Lesson Plan - Statistics · LessonPlan-SP.pdf". */
const docName = (name: string) => name.split(' · ')[0]

/** The collapsed row's topic: an exam or a day off said plainly, an unknown topic too. */
function TopicLine({ m }: { m: Meeting }) {
  if (m.kind === 'off') return <small className="sc-off">No class · {m.topic}</small>
  if (!m.topic) return <small className="sc-src none">Topic not in the course's timeline or outline</small>
  return (
    <small className={`sc-topic-line ${m.kind}`}>
      {m.kind === 'exam' && <b className="sc-exam">Exam</b>}
      {m.topic}
    </small>
  )
}

/**
 * Classes: one agenda (today, tomorrow, and the next class if it is later), where every meeting is
 * the same row and the next one starts open; then the weekly schedule; then, folded away, where
 * the schedule comes from and the user's say over it. Questions that need the user come first.
 */
function Classes({ scele, now }: { scele: SceleState; now: number }) {
  const today = dayStart(now)
  // the agenda changes with the day and with what SCELE says, not with every tick of the clock
  const { upcoming } = scele
  const ahead = useMemo(() => upcoming(today, 15), [upcoming, today])
  const next = ahead.find((m) => m.end > now && m.kind !== 'off')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState<Partial<Omit<ClassSlot, 'id'>> | null>(null)
  const isOpen = (m: Meeting) => open[meetingKey(m)] ?? (next !== undefined && meetingKey(m) === meetingKey(next))
  const toggle = (m: Meeting) => setOpen((o) => ({ ...o, [meetingKey(m)]: !isOpen(m) }))
  const setTime = (slot: ClassSlot) => setAdding({ courseId: slot.courseId, day: slot.day })
  // "Get times from SLCM" on a class opens the sign-in in the card at the top
  const [askSlcm, setAskSlcm] = useState(0)
  const later = next && dayStart(next.start) >= today + 2 * DAY ? next : null
  const row = (m: Meeting) => (
    <MeetingRow key={meetingKey(m)} m={m} now={now} isNext={m === next} open={isOpen(m)} onToggle={() => toggle(m)} scele={scele} onSetTime={setTime} onAskSlcm={() => setAskSlcm((n) => n + 1)} />
  )

  return (
    <div className="sc-list">
      <NeedsYou scele={scele} askSlcm={askSlcm} />
      {scele.slots.length > 0 && (
        <>
          {[
            { title: 'Today', day: today, empty: 'No classes today' },
            { title: 'Tomorrow', day: today + DAY, empty: 'No classes tomorrow' },
          ].map(({ title, day, empty }) => {
            const list = ahead.filter((m) => sameDay(m.start, day + 12 * 3600_000))
            return (
              <section key={title}>
                <h4>{title}</h4>
                {list.length ? list.map(row) : <small className="sc-none">{empty}</small>}
              </section>
            )
          })}
          {later && (
            <section>
              <h4>{new Date(later.start).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}</h4>
              {row(later)}
            </section>
          )}
        </>
      )}

      <section>
        <h4>
          Every week
          <button className="chip" data-cuelume-open data-cuelume-emphasis="subtle" aria-expanded={adding !== null} onClick={() => setAdding((a) => (a ? null : {}))}>
            {adding ? 'Done' : (
              <>
                <Plus size={10} aria-hidden /> Add
              </>
            )}
          </button>
        </h4>
        {adding && <AddSlot scele={scele} initial={adding} onAdded={() => setAdding(null)} />}
        {!scele.slots.length && !adding && (
          <div className="empty">{scele.syncing ? 'Reading your courses’ timelines…' : 'No class days found in this term’s courses yet. Connect SLCM below, or add yours, to get a heads-up and the day’s topic before each class.'}</div>
        )}
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const slots = scele.slots.filter((s) => s.day === d).sort((a, b) => (a.start || '99').localeCompare(b.start || '99'))
          if (!slots.length) return null
          return (
            <div key={d} className="sc-weekday">
              <span className="sc-day">{dayName(d)}</span>
              <div>
                {slots.map((s) => (
                  <SlotRow key={s.id} slot={s} name={titleOf(scele, s)} onRemove={() => scele.removeSlot(s)} onSetTime={() => setTime(s)} />
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <Sources scele={scele} />

      {scele.slots.length > 0 && (
        <div className="sc-lead">
          <span>Remind me</span>
          <div className="segmented small">
            {[10, 30, 60].map((m) => (
              <button key={m} className={scele.lead === m ? 'active' : ''} data-cuelume-select onClick={() => scele.setLead(m)}>
                {m} min
              </button>
            ))}
          </div>
          <span>before class</span>
        </div>
      )}
    </div>
  )
}

const titleOf = (scele: SceleState, s: ClassSlot) => {
  const c = scele.courses.find((x) => x.id === s.courseId)
  return c ? courseTitle(c) : (s.name ?? '?')
}

const SLCM_STAGE = {
  loading: 'Opening SLCM. Its site is slow, so this can take a few minutes…',
  'signing-in': 'Signing in to SSO UI…',
  'needs-you': 'SLCM needs you: finish signing in in its window.',
}

/**
 * Connecting SLCM: a button that asks for the SSO UI password, then the progress of the hidden SLCM
 * window, which signs in with it and reads the study plan. The password is used once and not kept.
 */
function SlcmConnect({ scele, label, primary, open = false }: { scele: SceleState; label: string; primary?: boolean; open?: boolean }) {
  const [asking, setAsking] = useState(open)
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  // signed in once already: SLCM loading again is it reading the schedule
  const [signedIn, setSignedIn] = useState(false)
  const stage = scele.slcmStage
  useEffect(() => {
    if (stage === 'signing-in') setSignedIn(true)
    if (stage === null) setSignedIn(false)
  }, [stage])
  const start = (password: string | null) => {
    setError(null)
    setAsking(false)
    setPass('')
    scele
      .connectSlcm(password)
      .then((ok) => {
        if (ok) play('success')
        else setError('The SLCM window closed before your schedule came through.')
      })
      .catch((e) => {
        play('error')
        setError(typeof e === 'string' ? e : 'Could not open SLCM')
      })
  }
  if (stage)
    return (
      <div className="sc-slcm">
        <small className={stage === 'needs-you' ? 'sc-warn' : 'sc-progress'}>{stage === 'loading' && signedIn ? 'Signed in. Reading your schedule…' : SLCM_STAGE[stage]}</small>
        <span className="sc-chips">
          <button className={`chip ${stage === 'needs-you' ? 'on' : ''}`} data-cuelume-open onClick={() => scele.showSlcm()}>
            Show window
          </button>
          <button className="chip ghost" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => scele.cancelSlcm()}>
            Stop
          </button>
        </span>
      </div>
    )
  if (asking)
    return (
      <div className="sc-slcm" onKeyDown={(e) => e.stopPropagation()}>
        <div className="sc-slcm-row">
          <input
            className="todo-input"
            type="password"
            aria-label="SSO UI password"
            placeholder="SSO UI password"
            autoComplete="current-password"
            autoFocus
            value={pass}
            data-cuelume-type
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && pass && start(pass)}
          />
          <button className="pill-btn" disabled={!pass} onClick={() => start(pass)}>
            Sign in
          </button>
        </div>
        <small className="sc-hint">
          Signs in as <b>{scele.account?.username}</b> on login.ui.ac.id, the same password as SCELE. It isn't saved.
          {scele.slcm && (
            <>
              {' '}
              <button className="sc-inline-link" onClick={() => start(null)}>
                Still signed in? Read without it
              </button>
            </>
          )}
        </small>
        <button className="chip ghost sc-slcm-cancel" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    )
  return (
    <div className="sc-slcm">
      <span className="sc-chips">
        <button className={`chip ${primary ? 'on' : ''}`} data-cuelume-open onClick={() => setAsking(true)}>
          {label}
        </button>
      </span>
      {error && <small className="sc-error">{error}</small>}
    </div>
  )
}

/** What the schedule can't settle alone, asked once, at the top. */
function NeedsYou({ scele, askSlcm }: { scele: SceleState; askSlcm: number }) {
  const card = useRef<HTMLElement>(null)
  const untimed = new Set(scele.slots.filter((s) => !s.start).map((s) => s.courseId)).size
  useEffect(() => {
    if (askSlcm) card.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [askSlcm])
  return (
    <>
      {untimed > 0 && !scele.slcm && (
        <section className="sc-ask" ref={card}>
          <span>
            <b>
              {untimed} course{untimed > 1 ? 's don’t' : ' doesn’t'} list a class time
            </b>
            <small>Your study plan in SLCM has the times and rooms. The island signs in to SLCM for you and reads them.</small>
          </span>
          {/* a class's "Get times from SLCM" opens it here, already asking */}
          <SlcmConnect key={askSlcm} scele={scele} label="Get times from SLCM" primary open={askSlcm > 0} />
        </section>
      )}
      {scele.duplicates.map((q) => (
        <section key={q.subject} className="sc-ask">
          <span>
            <b>You're enrolled in {q.courses.length} courses for the same subject</b>
            <small>That's often an enrolment mistake. Which one is your actual class?</small>
          </span>
          <div className="sc-pick">
            {q.courses.map((c) => (
              <button key={c.id} className="sc-row" data-cuelume-select onClick={() => scele.choosePrimary(q.subject, c.id)}>
                <span className="sc-main">
                  <b>{c.name}</b>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {/* a combined course whose groups don't say which class is the user's */}
      {scele.unsure.map((u) => (
        <section key={u.courseId} className="sc-ask">
          <span>
            <b>Which class of {u.course} are you in?</b>
            <small>Its page lists classes {u.labels.join(', ')}, and SCELE doesn't say which is yours.</small>
          </span>
          <div className="sc-chips">
            {u.labels.map((l) => (
              <button key={l} className="chip" data-cuelume-select onClick={() => scele.chooseClass(u.courseId, l)}>
                Class {l}
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** One meeting: a row that opens to what it covers. The next class starts open. */
function MeetingRow(props: {
  m: Meeting
  now: number
  isNext: boolean
  open: boolean
  onToggle: () => void
  scele: SceleState
  onSetTime: (s: ClassSlot) => void
  onAskSlcm: () => void
}) {
  const { m, now, isNext, open, onToggle } = props
  const live = Boolean(m.slot.start) && m.start <= now && m.end > now
  const past = Boolean(m.slot.start) && m.end <= now
  const badge = live ? `In class now · until ${m.slot.end}` : isNext ? `Next class${m.slot.start ? ` · ${relTime(m.start, now)}` : ''}` : null
  return (
    <div className={`sc-meeting ${m.kind} ${open ? 'open' : ''} ${isNext || live ? 'next' : ''} ${past ? 'past' : ''}`}>
      <button className="sc-meeting-head" aria-expanded={open} data-cuelume-tap data-cuelume-emphasis="subtle" onClick={onToggle}>
        <span className="sc-time">
          <b>{m.slot.start || '—'}</b>
          <small>{m.slot.start ? m.slot.end : 'no time'}</small>
        </span>
        <span className="sc-main">
          {badge && <small className="sc-badge-line">{badge}</small>}
          <b>
            {m.title}
            {m.slot.teaching && <span className="sc-ta">TA</span>}
          </b>
          {!open && <TopicLine m={m} />}
        </span>
        <ChevronDown size={14} className="sc-chev" aria-hidden />
      </button>
      {open && <MeetingDetail {...props} />}
    </div>
  )
}

/**
 * What a meeting covers, in the order a student asks: where and when, what it's about (and where
 * that is written, at its page, with how sure it is), then the course page's section and materials
 * for it. Nothing is listed rather than something unrelated.
 */
function MeetingDetail({ m, now, scele, onSetTime, onAskSlcm }: { m: Meeting; now: number; scele: SceleState; onSetTime: (s: ClassSlot) => void; onAskSlcm: () => void }) {
  const due = m.course ? scele.deadlines.filter((d) => d.courseId === m.course!.id && d.due > now).slice(0, 2) : []
  const syllabus = !m.topic && m.course ? syllabusLinks(scele.contents[m.course.id] ?? []) : []
  const where = [m.slot.room && `Room ${m.slot.room}`, m.slot.source && `times from the ${SOURCE_NAME[m.slot.source]}`].filter(Boolean).join(' · ')
  return (
    <div className="sc-detail">
      {m.slot.start ? (
        where && <small className="sc-meta">{where}</small>
      ) : (
        <div className="sc-fix">
          <small>Time not listed on SCELE</small>
          {!scele.slcm && (
            <button className="chip" data-cuelume-open disabled={scele.slcmBusy} onClick={onAskSlcm}>
              {scele.slcmBusy ? 'Reading SLCM…' : 'Get times from SLCM'}
            </button>
          )}
          <button className="chip ghost" data-cuelume-open onClick={() => onSetTime(m.slot)}>
            Set time
          </button>
        </div>
      )}

      {m.kind === 'off' ? (
        <p className="sc-off">No class · {m.topic}</p>
      ) : m.topic ? (
        <div className="sc-topic">
          <b>
            {m.kind === 'exam' && <span className="sc-exam">Exam</span>}
            {m.topic}
          </b>
          {m.detail.map((d) => (
            <p key={d}>{d}</p>
          ))}
          <span className="sc-prov">
            {m.source && (
              <button className="sc-link" data-cuelume-open title={`Open ${m.source.name}`} onClick={() => openScele(m.source!.url)}>
                <FileText size={12} aria-hidden />
                <span>
                  {docName(m.source.name)}
                  {m.source.page && ` · page ${m.source.page}`}
                </span>
              </button>
            )}
            {m.from && <small className={`sc-src ${CERTAINTY[m.from].cls}`}>{CERTAINTY[m.from].word}</small>}
          </span>
        </div>
      ) : (
        <p className="sc-src none">This class's topic isn't in the course's timeline or outline.</p>
      )}

      {m.kind !== 'off' && m.course && (
        <div className="sc-cover">
          <small className="sc-cover-label">On SCELE</small>
          {m.section && (
            <button className="sc-link" data-cuelume-open onClick={() => openScele(m.section!.url)}>
              <FolderOpen size={12} aria-hidden />
              <span>{m.section.name}</span>
            </button>
          )}
          {m.materials.map((mat) => (
            <button key={mat.id} className={`sc-link ${m.section ? 'sub' : ''}`} data-cuelume-open onClick={() => openScele(mat.url)}>
              <BookOpen size={12} aria-hidden />
              <span>{mat.name}</span>
            </button>
          ))}
          {syllabus.map((s) => (
            <button key={s.id} className="sc-link" data-cuelume-open onClick={() => openScele(s.url)}>
              <FileText size={12} aria-hidden />
              <span>{s.name}</span>
            </button>
          ))}
          {!m.section && !m.materials.length && !syllabus.length && (
            <small className="sc-none-inline">{m.topic ? 'Nothing posted for this topic yet' : 'Nothing found for this class'}</small>
          )}
        </div>
      )}

      {due.length > 0 && (
        <div className="sc-chips">
          {due.map((d) => (
            <button key={d.id} className="chip" data-cuelume-open onClick={() => openScele(d.url)}>
              <Clock size={10} aria-hidden /> {d.name} · due {relTime(d.due, now)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Where the schedule comes from, folded away: SLCM, then this term's courses and what was found
 * for each, with the user's say (TA, Hide). Earlier terms' courses SCELE still lists are named.
 */
function Sources({ scele }: { scele: SceleState }) {
  const [showHidden, setShowHidden] = useState(false)
  const missing = scele.status.filter((s) => !s.hidden && !s.found && !s.teaching && !s.waiting).length
  const hidden = scele.status.filter((s) => s.hidden)
  const rows = scele.status.filter((s) => !s.hidden || showHidden)
  return (
    <details className="sc-sources">
      <summary>
        <span>Where your schedule comes from</span>
        {missing > 0 && <small className="sc-warn-count">{missing} without class days</small>}
        <ChevronDown size={14} className="sc-chev" aria-hidden />
      </summary>

      <div className="sc-row static">
        <CalendarClock size={16} className="sc-src-icon" aria-hidden />
        <span className="sc-main">
          <b>SLCM study plan</b>
          <small>
            {scele.slcm ? `${scele.slcm.classes.length} weekly classes · read ${relTime(scele.slcm.at, Date.now())}` : 'Official class times and rooms, from your study plan.'}
          </small>
          <SlcmConnect scele={scele} label={scele.slcm ? 'Read again' : 'Connect'} primary={!scele.slcm} />
        </span>
        {scele.slcm && !scele.slcmBusy && (
          <span className="sc-chips">
            <button className="chip ghost" data-cuelume-close data-cuelume-emphasis="subtle" onClick={scele.forgetSlcm}>
              Forget
            </button>
          </span>
        )}
      </div>

      <h4>
        This term's courses
        {hidden.length > 0 && (
          <button className="chip ghost" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Hide hidden' : `${hidden.length} hidden`}
          </button>
        )}
      </h4>
      {rows.map(({ course: c, found, source, teaching, hidden: off, timeline, blocked, waiting }) => (
        <div key={c.id} className={`sc-row static sc-course ${off ? 'off' : ''}`}>
          <span className="sc-main">
            <b title={c.full}>{courseTitle(c)}</b>
            <small className={!off && !found && !scele.syncing && !teaching && !waiting ? 'sc-missing' : ''}>
              {off
                ? 'Hidden from the schedule'
                : waiting
                  ? 'Waiting for you to pick your class above'
                  : found
                  ? `${found} class${found > 1 ? 'es' : ''} a week · from the ${SOURCE_NAME[source ?? 'page']}`
                  : scele.syncing
                    ? 'Reading its documents…'
                    : 'No class days found · add them under Every week'}
            </small>
            {timeline && !off && (
              <button className="sc-link small" data-cuelume-open title="Open the document the topics come from" onClick={() => openScele(browserUrl(timeline.url))}>
                <FileText size={11} aria-hidden />
                <span>
                  Topics from “{docName(timeline.name)}” · {timeline.sessions} entries
                </span>
              </button>
            )}
            {blocked.map((b) => (
              <button key={b.url} className="sc-link small warn" data-cuelume-open title="Shared only with signed-in accounts, so the island can't read it. Open it, or ask for a PDF version." onClick={() => openScele(b.url)}>
                <Lock size={11} aria-hidden />
                <span>“{b.name}” needs a Google sign-in</span>
              </button>
            ))}
          </span>
          <span className="sc-chips">
            <button className={`chip ${teaching ? 'on' : ''}`} aria-pressed={teaching} title="You're a teaching assistant for this course" data-cuelume-toggle onClick={() => scele.setTeaching(c.id, !teaching)}>
              TA
            </button>
            <button className="chip ghost" data-cuelume-toggle data-cuelume-emphasis="subtle" onClick={() => scele.setHidden(c.id, !off)}>
              {off ? 'Show' : 'Hide'}
            </button>
          </span>
        </div>
      ))}
      {scele.earlier.length > 0 && (
        <small className="sc-earlier" title={scele.earlier.map((c) => c.full).join('\n')}>
          Left out, from an earlier term: {scele.earlier.map((c) => c.short).join(', ')}
        </small>
      )}
      {scele.tuned && (
        <button className="sc-link small sc-reset" data-cuelume-navigate title="Forget your class picks, removed classes, TA marks and hidden courses" onClick={scele.redetect}>
          <RotateCcw size={11} aria-hidden />
          <span>Start over: forget my picks and read the courses again</span>
        </button>
      )}
    </details>
  )
}

function SlotRow({ slot, name, onRemove, onSetTime }: { slot: ClassSlot; name: string; onRemove: () => void; onSetTime: () => void }) {
  return (
    <div className="sc-row static sc-slot">
      <span className="sc-slot-time">{slot.start ? `${slot.start}–${slot.end}` : 'no time'}</span>
      <span className="sc-main">
        <b>
          {name}
          {slot.teaching && (
            <span className="sc-ta" title="You teach this course (TA)">
              TA
            </span>
          )}
        </b>
        <small>
          {[slot.room, slot.auto ? `from the ${SOURCE_NAME[slot.source ?? 'page']}` : 'added by you'].filter(Boolean).join(' · ')}
        </small>
      </span>
      {!slot.start && (
        <button className="chip" data-cuelume-open onClick={onSetTime}>
          Set time
        </button>
      )}
      <button className="x" aria-label={slot.auto ? `Not my class: hide ${name} on this day` : `Remove ${name}`} title={slot.auto ? 'Not my class' : 'Remove'} data-cuelume-close data-cuelume-emphasis="subtle" onClick={onRemove}>
        ×
      </button>
    </div>
  )
}

function AddSlot({ scele, initial, onAdded }: { scele: SceleState; initial: Partial<Omit<ClassSlot, 'id'>>; onAdded: () => void }) {
  const [courseId, setCourseId] = useState(initial.courseId || scele.courses[0]?.id || 0)
  const [day, setDay] = useState(initial.day ?? 1)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('09:40')
  const [room, setRoom] = useState('')
  const stop = (e: React.KeyboardEvent) => e.stopPropagation()
  if (!scele.courses.length) return <div className="empty">No courses this period yet. Sync first.</div>
  return (
    <div className="sc-add" onKeyDown={stop}>
      <select className="todo-input" aria-label="Course" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
        {scele.courses.map((c) => (
          <option key={c.id} value={c.id}>
            {courseTitle(c)}
          </option>
        ))}
      </select>
      <div className="sc-add-row">
        <select className="todo-input" aria-label="Day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <option key={d} value={d}>
              {dayName(d, 'long')}
            </option>
          ))}
        </select>
        <input className="todo-input" type="time" aria-label="Starts" value={start} onChange={(e) => setStart(e.target.value)} />
        <input className="todo-input" type="time" aria-label="Ends" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="sc-add-row">
        <input className="todo-input" placeholder="Room (optional)" value={room} data-cuelume-type onChange={(e) => setRoom(e.target.value)} />
        <button
          className="pill-btn"
          disabled={!courseId || end <= start}
          onClick={() => {
            play('tap')
            scele.addSlot({ courseId, day, start, end, room: room.trim() })
            onAdded()
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}

function InboxPage({ scele, now }: { scele: SceleState; now: number }) {
  return (
    <div className="sc-list">
      {scele.fresh.length > 0 && (
        <section>
          <h4>New on course pages</h4>
          {scele.fresh.slice(0, 6).map((f) => (
            <button key={f.key} className="sc-row" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => openScele(f.url)}>
              <i className="sc-dot info" />
              <span className="sc-main">
                <b>{f.name}</b>
                <small>{f.course}</small>
              </span>
              <span className="sc-when">
                <small>{relTime(f.at, now)}</small>
              </span>
            </button>
          ))}
        </section>
      )}
      <section>
        <h4>Notifications</h4>
        {!scele.notices.length && (
          <div className="empty">
            <Inbox size={20} strokeWidth={1.7} aria-hidden />
            No notifications
          </div>
        )}
        {scele.notices.map((n) => (
          <button key={n.id} className={`sc-row ${n.read ? 'read' : ''}`} data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => openScele(n.url)}>
            <i className={`sc-dot ${n.read ? '' : 'info'}`} />
            <span className="sc-main">
              <b>{n.subject}</b>
              {n.text && <small>{n.text}</small>}
            </span>
            <span className="sc-when">
              <small>{relTime(n.time, now)}</small>
            </span>
          </button>
        ))}
      </section>
      <div className="sc-account">
        <span>
          Signed in as <b>{scele.account?.fullname || scele.account?.username}</b>
        </span>
        <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={scele.logout}>
          <LogOut size={11} aria-hidden /> Disconnect
        </button>
      </div>
    </div>
  )
}
