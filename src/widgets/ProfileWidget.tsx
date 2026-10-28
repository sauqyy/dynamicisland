import { useEffect, useRef, useState } from 'react'
import { ACCENTS, type Settings } from '../lib/settings'
import { BACKEND_READY } from '../lib/supabase'
import { USERNAME_RE, type Auth } from '../lib/useAuth'
import { squarePhoto } from '../lib/photo'
import { PRESENCES, presenceOf } from '../lib/presence'
import { DEMO_SOCIAL } from '../lib/useDemo'
import { Avatar } from './Avatar'
import { play } from 'cuelume'
import { disclosureCue } from '../lib/sound'
import type { StudentState } from '../lib/sso'
import { BadgeCheck } from 'lucide-react'
import { UI_YELLOW, UiLogo } from './UiLogo'

const EMOJIS = ['🙂', '😎', '🤖', '🦊', '🐼', '🐸', '🦄', '🐙', '🌵', '🚀', '🎧', '🔥', '🌙', '🍕', '👾', '🐱']

interface Props {
  auth: Auth
  settings: Settings
  update: (patch: Partial<Settings>) => void
  /** keep the card open while a system dialog (file picker) has the pointer */
  onHold: (on: boolean) => void
  /** SSO UI verification, which unlocks the Campus pages */
  student: StudentState
}

/** "Verify Student" with SSO UI. Separate from the friends account, so it works without one. */
function StudentCard({ student, onHold }: { student: StudentState; onHold: (on: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const s = student.student

  const verify = async () => {
    setBusy(true)
    setMsg(null)
    // the browser takes the pointer while the user signs in; keep the card open for when they come back
    onHold(true)
    try {
      const who = await student.verify()
      if (who.fasilkom) {
        play('success')
      } else {
        play('error', { emphasis: 'subtle' })
        setMsg(`Signed in as ${who.name || who.username}, but the Campus pages are only for Fasilkom UI students.`)
      }
    } catch (e) {
      play('error', { emphasis: 'subtle' })
      setMsg(typeof e === 'string' ? e : 'SSO UI sign-in failed')
    } finally {
      setBusy(false)
      onHold(false)
    }
  }

  return (
    <div className="field student-card">
      <label>Universitas Indonesia</label>
      {s ? (
        <div className="student-id">
          <UiLogo size={26} color={UI_YELLOW} />
          <span>
            <b>
              {s.name || s.username} <BadgeCheck size={13} strokeWidth={2.2} className="student-check" aria-label="Verified with SSO UI" />
            </b>
            <small>
              {s.npm} · Fasilkom UI{s.study_program ? ` · ${s.study_program.replace(/\s*\(.*\)$/, '')}` : ''}
            </small>
          </span>
          <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={student.forget}>
            Remove
          </button>
        </div>
      ) : (
        <>
          <small>Verify with SSO UI to unlock Campus: SCELE deadlines, class reminders and course updates. For Fasilkom UI students.</small>
          <button className="pill-btn student-btn" disabled={busy || student.student === undefined} data-cuelume-tap onClick={verify}>
            <UiLogo size={15} color={UI_YELLOW} /> {busy ? 'Waiting for SSO UI…' : 'Verify Student'}
          </button>
          {busy && <small>Sign in on the SSO UI page that opened in your browser.</small>}
        </>
      )}
      {msg && <div className="form-msg">{msg}</div>}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} data-cuelume-toggle>
      <span />
    </button>
  )
}

const STATUS_TEMPLATES = [
  '🟢 Available',
  '📚 Studying',
  '💻 Working',
  '🎧 Listening to music',
  '🎮 Gaming',
  '🍽️ Eating',
  '🏃 Working out',
  '🚫 Busy, do not disturb',
  '😴 Sleeping',
  '✈️ Away',
]

/** Status text box with a drop-down of ready-made statuses. */
function StatusField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="status-field" ref={box}>
      <input
        className="todo-input"
        placeholder="e.g. studying 📚"
        value={value}
        data-cuelume-type
        maxLength={80}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <button className={`status-toggle ${open ? 'open' : ''}`} aria-label="Choose a status" title="Templates" {...disclosureCue(open)} data-cuelume-emphasis="subtle" onClick={() => setOpen((o) => !o)}>
        ▾
      </button>
      {open && (
        <div className="city-list status-list" role="listbox">
          {STATUS_TEMPLATES.map((t) => (
            <button
              key={t}
              role="option"
              aria-selected={t === value}
              className={t === value ? 'active' : ''}
              data-cuelume-select
              onClick={() => {
                onChange(t)
                setOpen(false)
              }}
            >
              <span>{t}</span>
            </button>
          ))}
          {value && (
            <button
              className="status-clear"
              data-cuelume-close
              data-cuelume-emphasis="subtle"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              <span>Clear status</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SignIn({ auth }: { auth: Auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setMsg(null)
    setMsg(await fn())
    setBusy(false)
  }
  const ready = email.includes('@') && password.length >= 6
  const tooShort = password.length > 0 && password.length < 6

  return (
    <div className="profile-auth">
      <button className="google-btn" disabled={busy} data-cuelume-tap onClick={() => run(auth.signInWithGoogle)}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.4z" />
          <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>
      <div className="or">or</div>
      <input
        className="todo-input"
        type="email"
        placeholder="Email"
        value={email}
        data-cuelume-type
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <input
        className="todo-input"
        type="password"
        placeholder="Password (6+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && ready) {
            play('tap')
            run(() => auth.signIn(email, password))
          }
        }}
      />
      {tooShort && <div className="form-warn">Password must be at least 6 characters ({password.length}/6)</div>}
      <div className="presets">
        <button className="pill-btn" disabled={!ready || busy} data-cuelume-tap onClick={() => run(() => auth.signIn(email, password))}>
          Sign in
        </button>
        <button className="pill-btn" disabled={!ready || busy} data-cuelume-tap onClick={() => run(() => auth.signUp(email, password))}>
          Create account
        </button>
      </div>
      {msg && <div className="form-msg">{msg}</div>}
    </div>
  )
}

function Editor({ auth, settings, update, onHold }: Props) {
  const p = auth.profile
  const [username, setUsername] = useState(p?.username ?? '')
  const [name, setName] = useState(p?.display_name ?? '')
  const [status, setStatus] = useState(p?.status ?? '')
  const [emoji, setEmoji] = useState(p?.avatar_emoji ?? '🙂')
  const [color, setColor] = useState(p?.avatar_color ?? ACCENTS[1])
  const [photo, setPhoto] = useState<string | null>(p?.avatar_url ?? null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const uname = username.trim().toLowerCase()
  const valid = USERNAME_RE.test(uname)
  const dirty =
    !p || uname !== p.username || name !== p.display_name || status !== p.status || emoji !== p.avatar_emoji || color !== p.avatar_color || photo !== (p.avatar_url ?? null)

  // the file dialog takes the pointer away, which would otherwise close the card under it
  const openPicker = () => {
    onHold(true)
    window.addEventListener('focus', () => setTimeout(() => onHold(false), 1500), { once: true })
    fileInput.current?.click()
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      setPhoto(await squarePhoto(file))
      setMsg(null)
    } catch {
      play('error', { emphasis: 'subtle' })
      setMsg("That file couldn't be read as an image")
    }
  }

  const save = async () => {
    setBusy(true)
    const err = await auth.saveProfile({
      username: uname,
      display_name: name.trim(),
      status: status.trim(),
      avatar_emoji: emoji,
      avatar_color: color,
      avatar_url: photo,
    })
    play(err ? 'error' : 'success', { emphasis: 'subtle' })
    setMsg(err ?? 'Saved')
    setBusy(false)
  }

  return (
    <div className="profile-edit">
      <div className="profile-card">
        <div className="avatar-edit">
          <Avatar profile={{ avatar_emoji: emoji, avatar_color: color, avatar_url: photo }} size={92} presence={p ? presenceOf(p) : undefined} />
          <div className="avatar-overlay">
            <button className="ao-text" data-cuelume-open onClick={openPicker}>
              Choose photo
            </button>
            <button className="ao-pen" aria-label="Choose photo" data-cuelume-open onClick={openPicker}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                <path d="m14.5 5.5 3 3" />
              </svg>
            </button>
            {photo ? (
              <button className="ao-text" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            ) : (
              <span className="ao-text ghost" aria-hidden />
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              pickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <div className="profile-id">
          <b>{name.trim() || (uname ? `@${uname}` : 'New profile')}</b>
          {uname && <span className="profile-handle">@{uname}</span>}
          {status.trim() && <span className="profile-status">{status.trim()}</span>}
          <small>{auth.user?.email}</small>
        </div>
        {p && (
          <button className="chip" data-cuelume-close onClick={auth.signOut}>
            Sign out
          </button>
        )}
      </div>

      {!p && <div className="form-msg">Pick a username so friends can find you.</div>}

      {p && (
        <div className="field">
          <label>Availability</label>
          <div className="presence-grid" role="radiogroup">
            {PRESENCES.map((o) => (
              <button
                key={o.id}
                role="radio"
                data-p={o.id}
                aria-checked={o.id === presenceOf(p)}
                className={o.id === presenceOf(p) ? 'active' : ''}
                data-cuelume-select
                onClick={async () => {
                  const err = await auth.saveProfile({ presence: o.id })
                  if (err) {
                    play('error', { emphasis: 'subtle' })
                    setMsg(err)
                  }
                }}
              >
                <i className={`presence-dot inline ${o.id}`} />
                {o.label}
              </button>
            ))}
          </div>
          <small>{PRESENCES.find((o) => o.id === presenceOf(p))?.hint}</small>
        </div>
      )}

      <div className="field">
        <label>Avatar</label>
        <small>{photo ? 'Hover your picture to change or remove the photo. It replaces the emoji.' : 'Hover your picture to add a photo, or pick an emoji and a colour:'}</small>
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className={e === emoji ? 'active' : ''} data-cuelume-select onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button key={c} aria-label={c} className={c === color ? 'active' : ''} data-cuelume-select style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Username</label>
        <div className="at-input">
          <span>@</span>
          <input
            className="todo-input"
            placeholder="yourname"
            value={username}
            data-cuelume-type
            maxLength={20}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, ''))}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <small className={uname && !valid ? 'bad' : ''}>3–20 letters, numbers or _. Friends add you with this.</small>
      </div>

      <div className="field">
        <label>Display name</label>
        <input
          className="todo-input"
          placeholder="Shown to your friends"
          value={name}
          data-cuelume-type
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="field">
        <label>Status</label>
        <StatusField value={status} onChange={setStatus} />
      </div>

      <div className="profile-actions">
        <button className="pill-btn" disabled={!valid || !dirty || busy} data-cuelume-tap onClick={save}>
          {p ? 'Save profile' : 'Create profile'}
        </button>
        {msg && <span className="form-msg">{msg}</span>}
      </div>

      {p && (
        <div className="row share-row">
          <div>
            <span>Share what I'm doing</span>
            <small>Friends see your song or timer next to your name.</small>
          </div>
          <Toggle on={settings.shareActivity} onChange={(v) => update({ shareActivity: v })} />
        </div>
      )}
    </div>
  )
}

export function ProfileWidget(props: Props) {
  const { auth } = props
  let body
  if (!(BACKEND_READY || DEMO_SOCIAL)) {
    body = (
      <div className="empty-block">
        <b>Accounts aren't set up yet</b>
        <small>Add your Supabase URL and key to .env.local and rebuild. See supabase/README.md.</small>
      </div>
    )
  } else if (auth.loading) {
    body = <div className="empty-block">Loading…</div>
  } else if (!auth.user) {
    body = <SignIn auth={auth} />
  } else {
    // remount when the profile first appears so the form fields start from saved values
    body = <Editor key={auth.profile?.id ?? 'new'} {...props} />
  }
  return (
    <div className="scroll-panel" onClick={(e) => e.stopPropagation()}>
      {body}
      <StudentCard student={props.student} onHold={props.onHold} />
    </div>
  )
}
