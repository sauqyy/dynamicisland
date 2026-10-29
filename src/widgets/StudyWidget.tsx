import { Fragment, useMemo, useState } from 'react'
import { play } from 'cuelume'
import { CalendarRange, Clock, Flame, History, Play, Square, Trophy, UserPlus } from 'lucide-react'
import { Avatar } from './Avatar'
import { DEFAULT_LABEL, dayKey, dayTotal, fmtStudy, isStudying, lastDays, streakOf, type BoardRow, type StudyEntry, type StudyLog, type StudySession } from '../lib/study'
import type { Friend } from '../lib/useSocial'
import type { Group } from '../lib/useGroups'
import type { StudyRoom } from '../lib/useStudyRoom'

interface Props {
  log: StudyLog
  history: StudyEntry[]
  onClearHistory: () => void
  onStartSolo: (label: string, minutes: number) => void
  now: number
  session: StudySession | null
  signedIn: boolean
  friends: Friend[]
  board: BoardRow[]
  groups: Group[]
  rooms: Record<string, StudyRoom>
  share: boolean
  setShare: (v: boolean) => void
  onStartRoom: (gid: string, minutes: number) => void
  onJoinRoom: (gid: string) => void
  onLeave: () => void
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const LENGTHS = [15, 25, 50]
function dayName(key: string, nowMs: number): string {
  if (key === dayKey(nowMs)) return 'Today'
  if (key === dayKey(nowMs - 86_400_000)) return 'Yesterday'
  return new Date(`${key}T12:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
const MEDAL =['#fbbf24', '#cbd5e1', '#fb923c']

/** Study time, streak, who else is studying, shared rooms and the weekly leaderboard. */
export function StudyWidget({ log, history, onClearHistory, onStartSolo, now, session, signedIn, friends, board, groups, rooms, share, setShare, onStartRoom, onJoinRoom, onLeave }: Props) {
  const [minutes, setMinutes] = useState(25)
  const [subject, setSubject] = useState('')
  const [ask, setAsk] = useState(false)
  const [shown, setShown] = useState(8)
  const startSolo = () => {
    play('tap')
    onStartSolo(subject.trim() || DEFAULT_LABEL, minutes)
    setSubject('')
  }
  const days = useMemo(() => lastDays(now, 7), [now])
  const totals = days.map((k) => dayTotal(log, k))
  const peak = Math.max(30, ...totals)
  const week = totals.reduce((a, b) => a + b, 0)
  const streak = streakOf((k) => dayTotal(log, k), now)
  const today = totals[totals.length - 1]

  // this week's time per subject, biggest first
  const subjects = useMemo(() => {
    const by = new Map<string, number>()
    for (const k of days) for (const [label, m] of Object.entries(log[k] ?? {})) by.set(label, (by.get(label) ?? 0) + m)
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [days, log])

  const studying = friends.filter((f) => isStudying(f.activity))
  const inRoom = session?.gid
  const custom = !LENGTHS.includes(minutes)

  return (
    <div className="st" onClick={(e) => e.stopPropagation()}>
      {ask && session && (
        <div className="st-ask" role="alertdialog" aria-label="End study session" onClick={() => setAsk(false)}>
          <div className="st-ask-box" onClick={(e) => e.stopPropagation()}>
            <b>{session.gid ? 'Leave this session?' : 'Stop studying?'}</b>
            <small>
              {session.label} · {fmtStudy(Math.min((now - session.startedAt) / 60_000, session.maxMin))} so far. It will be saved to your history.
            </small>
            <div>
              <button className="st-btn" data-cuelume-tap onClick={() => setAsk(false)}>
                Keep going
              </button>
              <button
                className="st-btn stop"
                data-cuelume-close
                onClick={() => {
                  setAsk(false)
                  onLeave()
                }}
              >
                {session.gid ? 'Leave' : 'Stop'}
              </button>
            </div>
          </div>
        </div>
      )}
      {session && (
        <div className="st-live">
          <i aria-hidden />
          <span>
            <b>{session.gid ? 'Studying together' : 'Focusing'}</b>
            <small>{session.label}</small>
          </span>
          <button className="st-btn stop" data-cuelume-close onClick={() => setAsk(true)}>
            <Square size={10} strokeWidth={0} fill="currentColor" aria-hidden />
            Stop
          </button>
        </div>
      )}

      <div className="st-stats">
        <div>
          <Clock size={14} strokeWidth={2.2} aria-hidden />
          <b>{fmtStudy(today)}</b>
          <small>Today</small>
        </div>
        <div>
          <CalendarRange size={14} strokeWidth={2.2} aria-hidden />
          <b>{fmtStudy(week)}</b>
          <small>This week</small>
        </div>
        <div className={streak > 0 ? 'hot' : ''}>
          <Flame size={14} strokeWidth={2.2} aria-hidden />
          <b>{streak}</b>
          <small>Day streak</small>
        </div>
      </div>

      <div className="st-chart">
        <div className="st-week" aria-label="Study time this week">
          {days.map((k, i) => (
            <div key={k} className={`st-bar ${i === days.length - 1 ? 'today' : ''}`} title={`${k}: ${fmtStudy(totals[i])}`}>
              <i style={{ height: `${Math.max(totals[i] > 0 ? 10 : 4, (totals[i] / peak) * 100)}%` }} />
              <span>{DOW[new Date(`${k}T12:00`).getDay()]}</span>
            </div>
          ))}
        </div>
        {subjects.length > 0 && (
          <div className="st-subjects">
            {subjects.map(([label, m]) => (
              <span key={label}>
                {label} <b>{fmtStudy(m)}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {studying.length > 0 && (
        <section className="st-sec">
          <h4>Friends studying now</h4>
          <div className="st-now">
            {studying.map((f) => (
              <span key={f.profile.id} className="st-pal" title={f.activity}>
                <Avatar profile={f.profile} size={26} />
                <small>{f.profile.display_name || f.profile.username}</small>
              </span>
            ))}
          </div>
        </section>
      )}

      {!session && (
        <section className="st-sec">
          <h4>Session length</h4>
          <div className="st-seg" role="group" aria-label="Session length">
            {LENGTHS.map((m) => (
              <button key={m} className={minutes === m ? 'on' : ''} aria-pressed={minutes === m} data-cuelume-select onClick={() => setMinutes(m)}>
                {m}
                <small>min</small>
              </button>
            ))}
            <label className={custom ? 'on' : ''}>
              <input
                inputMode="numeric"
                placeholder="Custom"
                aria-label="Custom minutes"
                value={custom ? minutes || '' : ''}
                data-cuelume-type
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setMinutes(Math.min(480, Number(e.target.value.replace(/\D/g, '')) || 0))}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {custom && minutes > 0 && <small>min</small>}
            </label>
          </div>
        </section>
      )}

      {!session && (
        <section className="st-sec">
          <h4>Study on my own</h4>
          <input
            className="st-subject"
            placeholder="What are you studying? (optional)"
            aria-label="Subject"
            maxLength={40}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && minutes >= 1) startSolo()
            }}
          />
          <button className="st-btn primary st-go" disabled={minutes < 1} data-cuelume-tap onClick={startSolo}>
            <Play size={11} strokeWidth={0} fill="currentColor" aria-hidden />
            Start studying
          </button>
        </section>
      )}

      {signedIn && groups.length > 0 && (
        <section className="st-sec">
          <h4>Study together</h4>
          <div className="st-rooms">
            {groups.map((g) => {
              const room = rooms[g.id]
              const left = room ? Math.max(0, Math.ceil((room.endsAt - now) / 60_000)) : 0
              const mine = inRoom === g.id
              const here = room ? g.members.filter((p) => room.members.includes(p.id)) : []
              return (
                <div key={g.id} className={`st-room ${room ? 'live' : ''}`}>
                  <span className="st-room-ic" style={{ background: g.color }}>
                    {g.emoji}
                  </span>
                  <span className="st-room-tx">
                    <b>{g.name}</b>
                    <small>
                      {room ? (
                        <>
                          <i aria-hidden />
                          {room.task || 'Focus'} · {left}m left
                        </>
                      ) : (
                        'Nobody studying yet'
                      )}
                    </small>
                  </span>
                  {here.length > 0 && (
                    <span className="st-faces">
                      {here.slice(0, 3).map((p) => (
                        <Avatar key={p.id} profile={p} size={22} />
                      ))}
                      {here.length > 3 && <em>+{here.length - 3}</em>}
                    </span>
                  )}
                  {mine ? (
                    <button className="st-btn stop" data-cuelume-close onClick={() => setAsk(true)}>
                      Leave
                    </button>
                  ) : room ? (
                    <button className="st-btn primary" data-cuelume-tap onClick={() => onJoinRoom(g.id)}>
                      <UserPlus size={13} strokeWidth={2.4} aria-hidden />
                      Join
                    </button>
                  ) : (
                    <button
                      className="st-btn primary"
                      disabled={minutes < 1}
                      data-cuelume-tap
                      onClick={() => {
                        play('tap')
                        onStartRoom(g.id, minutes)
                      }}
                    >
                      <Play size={11} strokeWidth={0} fill="currentColor" aria-hidden />
                      Start
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="st-sec">
        <h4>
          <History size={12} strokeWidth={2.2} aria-hidden /> History
          {history.length > 0 && (
            <button className="st-clear" onClick={onClearHistory}>
              Clear
            </button>
          )}
        </h4>
        {history.length === 0 ? (
          <p className="st-hint">Finished sessions show up here.</p>
        ) : (
          <div className="st-hist">
            {history.slice(0, shown).map((e, i) => {
              const day = dayKey(e.at)
              const head = i === 0 || dayKey(history[i - 1].at) !== day
              return (
                <Fragment key={`${e.at}-${i}`}>
                  {head && (
                    <div className="st-hist-day">
                      <span>{dayName(day, now)}</span>
                      <b>{fmtStudy(dayTotal(log, day))}</b>
                    </div>
                  )}
                  <div className="st-hist-row">
                    <span className="st-hist-tx">
                      {e.label}
                      {e.together && <em>together</em>}
                    </span>
                    <small>{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                    <b>{fmtStudy(e.min)}</b>
                  </div>
                </Fragment>
              )
            })}
            {history.length > shown && (
              <button className="st-more" onClick={() => setShown((n) => n + 10)}>
                Show more
              </button>
            )}
          </div>
        )}
      </section>

      {signedIn && (
        <section className="st-sec">
          <h4>
            <Trophy size={12} strokeWidth={2.2} aria-hidden /> Leaderboard
            <label className="st-share">
              Share my time
              <input type="checkbox" role="switch" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <i aria-hidden />
            </label>
          </h4>
          <div className="st-board">
            {board.map((r, i) => (
              <div key={r.profile.id} className={`st-row ${r.me ? 'me' : ''}`}>
                <span className="st-rank" style={i < 3 ? { background: MEDAL[i], color: '#1a1a1a' } : undefined}>
                  {i + 1}
                </span>
                <Avatar profile={r.profile} size={26} />
                <span className="st-name">{r.me ? 'You' : r.profile.display_name || r.profile.username}</span>
                {r.streak > 0 && (
                  <span className="st-streak">
                    <Flame size={11} strokeWidth={2.4} aria-hidden />
                    {r.streak}
                  </span>
                )}
                <b>{fmtStudy(r.weekMin)}</b>
              </div>
            ))}
          </div>
          {board.length <= 1 && <p className="st-hint">Friends who share their study time show up here. Turn on “Share my time” and ask them to do the same.</p>}
        </section>
      )}
    </div>
  )
}
