import { useMemo, useState } from 'react'
import { play } from 'cuelume'
import { BookOpen, CalendarCheck, Inbox, LogOut, RefreshCw } from 'lucide-react'
import {
  DAY_NAMES,
  nextMeeting,
  openScele,
  relTime,
  syllabusLinks,
  topicFor,
  type ClassSlot,
  type Deadline,
} from '../lib/scele'
import type { SceleState } from '../lib/useScele'

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
      <span>{scele.error ? <span className="sc-error">{scele.error}</span> : scele.syncedAt ? `Synced ${relTime(scele.syncedAt, now)}` : 'Not synced yet'}</span>
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

const SOURCE = {
  dated: 'From SCELE: section dated this week',
  week: 'Estimated: week number counted from the course start',
}

function Classes({ scele, now }: { scele: SceleState; now: number }) {
  const [adding, setAdding] = useState(false)
  const upcoming = useMemo(
    () => scele.slots.map((s) => ({ slot: s, ...nextMeeting(s, now) })).sort((a, b) => a.start - b.start),
    [scele.slots, now],
  )
  const next = upcoming[0]
  const course = next && scele.courses.find((c) => c.id === next.slot.courseId)
  const sections = course ? scele.contents[course.id] ?? [] : []
  const topic = course ? topicFor(course, sections, next.start) : null
  const syllabus = syllabusLinks(sections)
  const dueSoon = course ? scele.deadlines.filter((d) => d.courseId === course.id && d.due > now).slice(0, 2) : []
  const live = next && next.start <= now

  return (
    <div className="sc-list">
      {next && course && (
        <section className="sc-next">
          <div className="sc-next-head">
            <span>
              <small>
                {live ? 'In class now' : 'Next class'}
                {next.slot.teaching && ' · you TA this'}
              </small>
              <b>{course.full}</b>
            </span>
            <span className="sc-when">
              <b>{live ? `until ${next.slot.end}` : relTime(next.start, now)}</b>
              <small>
                {DAY_NAMES[next.slot.day]} {next.slot.start}–{next.slot.end}
                {next.slot.room && ` · ${next.slot.room}`}
              </small>
            </span>
          </div>
          {topic ? (
            <div className="sc-topic">
              <b>{topic.section.name}</b>
              {topic.section.summary && <p>{topic.section.summary}</p>}
              <small className={`sc-src ${topic.source}`}>{SOURCE[topic.source]}</small>
              {topic.section.modules.filter((m) => m.mod !== 'label').slice(0, 3).map((m) => (
                <button key={m.id} className="sc-mat" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => openScele(m.url)}>
                  <BookOpen size={12} aria-hidden /> {m.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="sc-topic">
              <small className="sc-src none">This meeting's topic isn't on the SCELE course page. Check the syllabus to be sure.</small>
            </div>
          )}
          {(syllabus.length > 0 || dueSoon.length > 0) && (
            <div className="sc-chips">
              {syllabus.map((m) => (
                <button key={m.id} className="chip" data-cuelume-open onClick={() => openScele(m.url)}>
                  📄 {m.name}
                </button>
              ))}
              {dueSoon.map((d) => (
                <button key={d.id} className="chip" data-cuelume-open onClick={() => openScele(d.url)}>
                  ⏰ {d.name} · {relTime(d.due, now)}
                </button>
              ))}
            </div>
          )}
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

      <section>
        <h4>
          Weekly schedule
          <span className="sc-chips">
            {scele.tuned && (
              <button className="chip" data-cuelume-navigate data-cuelume-emphasis="subtle" title="Forget your class picks and removed classes, and read the course pages again" onClick={scele.redetect}>
                Re-detect
              </button>
            )}
            <button className="chip" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => setAdding((a) => !a)}>
              {adding ? 'Done' : '+ Add'}
            </button>
          </span>
        </h4>
        {adding && <AddSlot scele={scele} onAdded={() => setAdding(false)} />}
        {!scele.slots.length && !adding && !scele.duplicates.length && (
          <div className="empty">No class times found on this term's course pages or syllabi yet. Add yours to get a heads-up and the day's topic before each class.</div>
        )}
        {[...scele.slots]
          .sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.start.localeCompare(b.start))
          .map((s) => (
            <SlotRow key={s.id} slot={s} name={scele.courses.find((c) => c.id === s.courseId)?.short ?? '?'} onRemove={() => scele.removeSlot(s)} />
          ))}
        {/* a combined course whose groups don't say which class is the user's: listed, not asked */}
        {scele.unsure.map((u) => (
          <div key={u.courseId} className="sc-row static sc-unsure">
            <span className="sc-main">
              <b>{u.course}</b>
              <small>Lists classes {u.labels.join(', ')}; SCELE doesn't say which is yours</small>
            </span>
            <span className="sc-chips">
              {u.labels.map((l) => (
                <button key={l} className="chip" data-cuelume-select onClick={() => scele.chooseClass(u.courseId, l)}>
                  {l}
                </button>
              ))}
            </span>
          </div>
        ))}
      </section>

      <TermCourses scele={scele} />

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

/**
 * This term's courses and what the schedule found for each, so a missing one is visible, with the
 * user's say: TA (teaching it, not taking it) and Hide (leave it out). Earlier terms' courses that
 * SCELE still lists as in progress are named but left out.
 */
function TermCourses({ scele }: { scele: SceleState }) {
  const [showHidden, setShowHidden] = useState(false)
  if (!scele.status.length) return null
  const hidden = scele.status.filter((s) => s.hidden)
  const rows = scele.status.filter((s) => !s.hidden || showHidden)
  return (
    <section>
      <h4>
        This term's courses
        {hidden.length > 0 && (
          <button className="chip ghost" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Hide hidden' : `${hidden.length} hidden`}
          </button>
        )}
      </h4>
      {rows.map(({ course: c, found, source, teaching, hidden: off }) => (
        <div key={c.id} className={`sc-row static sc-course ${off ? 'off' : ''}`}>
          <span className="sc-main">
            <b title={c.full}>{c.full.replace(/^\s*\[[^\]]*\]\s*/, '')}</b>
            <small>
              {off
                ? 'Hidden from the schedule'
                : found
                  ? `${found} class${found > 1 ? 'es' : ''} a week · from the ${source === 'syllabus' ? 'syllabus' : 'course page'}`
                  : 'No class times found · add them with + Add'}
            </small>
          </span>
          <span className="sc-chips">
            <button
              className={`chip ${teaching ? 'on' : ''}`}
              aria-pressed={teaching}
              title="You're a teaching assistant for this course"
              data-cuelume-toggle
              onClick={() => scele.setTeaching(c.id, !teaching)}
            >
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
    </section>
  )
}

function SlotRow({ slot, name, onRemove }: { slot: ClassSlot; name: string; onRemove: () => void }) {
  return (
    <div className="sc-row static">
      <span className="sc-day">{DAY_NAMES[slot.day].slice(0, 3)}</span>
      <span className="sc-main">
        <b>{name}</b>
        <small>
          {slot.start}–{slot.end}
          {slot.room && ` · ${slot.room}`}
          {slot.auto && (
            <span className="sc-auto" title="Read from SCELE; it updates when the course does">
              {slot.source === 'syllabus' ? ' · from the syllabus' : ' · from the course page'}
            </span>
          )}
        </small>
      </span>
      {slot.teaching && <span className="sc-ta" title="You teach this course (TA)">TA</span>}
      <button className="x" aria-label={slot.auto ? 'Hide this class' : 'Remove class'} title={slot.auto ? 'Not my class' : 'Remove'} data-cuelume-close data-cuelume-emphasis="subtle" onClick={onRemove}>
        ×
      </button>
    </div>
  )
}

function AddSlot({ scele, onAdded }: { scele: SceleState; onAdded: () => void }) {
  const [courseId, setCourseId] = useState(scele.courses[0]?.id ?? 0)
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('09:40')
  const [room, setRoom] = useState('')
  const stop = (e: React.KeyboardEvent) => e.stopPropagation()
  if (!scele.courses.length) return <div className="empty">No courses this period yet. Sync first.</div>
  return (
    <div className="sc-add" onKeyDown={stop}>
      <select className="todo-input" value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
        {scele.courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.short} · {c.full}
          </option>
        ))}
      </select>
      <div className="sc-add-row">
        <select className="todo-input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <option key={d} value={d}>
              {DAY_NAMES[d]}
            </option>
          ))}
        </select>
        <input className="todo-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <input className="todo-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
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
