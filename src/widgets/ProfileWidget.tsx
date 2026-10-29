import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ACCENTS, type Settings } from '../lib/settings'
import { BACKEND_READY } from '../lib/supabase'
import { USERNAME_RE, type Auth } from '../lib/useAuth'
import { NO_CROP, MAX_ZOOM, clampCrop, cropPhoto, cropRect, type Crop } from '../lib/photo'
import { PRESENCES, presenceOf } from '../lib/presence'
import { DEMO_SOCIAL } from '../lib/useDemo'
import { Avatar } from './Avatar'
import { play } from 'cuelume'
import { disclosureCue } from '../lib/sound'
import type { StudentState } from '../lib/sso'
import { BadgeCheck } from 'lucide-react'
import { UI_YELLOW, UiLogo } from './UiLogo'

// written out, not imported, so the bundler can drop the campus card from the regular build
// also the browser dev server, for the SCELE demo (see campus.ts)
const CAMPUS = (import.meta.env.VITE_CAMPUS === '1' || (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window) && !location.search.includes('nocampus')))

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
      } else if (who.needs_scele) {
        play('ready')
      } else {
        play('error', { emphasis: 'subtle' })
        // what SSO UI sent goes along, so a faculty that isn't recognised can be told apart from another one
        setMsg(`Signed in as ${who.name || who.username}, but SSO UI doesn't list you as a Fasilkom UI student. ${who.detail}`)
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
      {s?.needs_scele ? (
        <ConfirmWithScele student={student} />
      ) : s ? (
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

/**
 * SSO UI vouched for the account but didn't say which faculty (its newer endpoints leave that out).
 * SCELE is Fasilkom's own e-learning, so signing in to it with courses there confirms Fasilkom,
 * and connects SCELE in the same step.
 */
function ConfirmWithScele({ student }: { student: StudentState }) {
  const s = student.student!
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async () => {
    if (!pass || busy) return
    setBusy(true)
    setMsg(null)
    try {
      await student.confirm(pass)
      play('success')
    } catch (e) {
      play('error', { emphasis: 'subtle' })
      setMsg(typeof e === 'string' ? e : 'SCELE sign-in failed')
    } finally {
      setBusy(false)
      setPass('')
    }
  }
  return (
    <div className="student-confirm">
      <div className="student-id">
        <UiLogo size={26} color={UI_YELLOW} />
        <span>
          <b>{s.name || s.username}</b>
          <small>{[s.npm, 'UI account verified · faculty not confirmed yet'].filter(Boolean).join(' · ')}</small>
        </span>
        <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={student.forget}>
          Remove
        </button>
      </div>
      <small>SSO UI didn't say which faculty you're in. Confirm Fasilkom by signing in to SCELE, Fasilkom's e-learning, with the same account. This also connects SCELE.</small>
      <div className="student-confirm-row">
        <input
          className="todo-input"
          type="password"
          placeholder="SSO UI password"
          autoComplete="current-password"
          value={pass}
          data-cuelume-type
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="pill-btn" disabled={busy || !pass} data-cuelume-tap onClick={submit}>
          {busy ? 'Checking…' : 'Confirm'}
        </button>
      </div>
      {msg && <div className="form-msg">{msg}</div>}
      {s.detail && <small className="student-detail">{s.detail}</small>}
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

/** A photo picked this session, kept so it can be re-cropped until the profile is saved. */
interface Source {
  url: string
  bitmap: ImageBitmap
}

const STAGE = 168

/** Drag to move, scroll or slide to zoom. The circle shows what friends will see. */
function PhotoCropper({ source, crop, onChange, onDone }: { source: Source; crop: Crop; onChange: (c: Crop) => void; onDone: () => void }) {
  const { width: w, height: h } = source.bitmap
  const drag = useRef<{ px: number; py: number; start: Crop } | null>(null)
  const r = cropRect(crop, w, h, STAGE)
  const set = (c: Crop) => onChange(clampCrop(c, w, h))

  return (
    <div className="field photo-crop">
      <label>Adjust photo</label>
      <div
        className="crop-stage"
        style={{ width: STAGE, height: STAGE }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { px: e.clientX, py: e.clientY, start: crop }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          set({ ...d.start, x: d.start.x + (e.clientX - d.px) / STAGE, y: d.start.y + (e.clientY - d.py) / STAGE })
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => set({ ...crop, zoom: crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })}
      >
        <img src={source.url} alt="" draggable={false} style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
        <div className="crop-ring" />
      </div>
      <div className="row slider-row">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          data-cuelume-select
          data-cuelume-emphasis="subtle"
          onChange={(e) => set({ ...crop, zoom: Number(e.target.value) })}
        />
        <span className="slider-value">{crop.zoom.toFixed(1)}×</span>
      </div>
      <small>Drag the photo to move it. It saves when you tap Done.</small>
      <div className="presets">
        <button className="chip" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={() => onChange(NO_CROP)}>
          Reset
        </button>
        <button className="pill-btn" data-cuelume-close onClick={onDone}>
          Done
        </button>
      </div>
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
  const [source, setSource] = useState<Source | null>(null)
  const [crop, setCrop] = useState<Crop>(NO_CROP)
  const [cropping, setCropping] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editName, setEditName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const [avatarPop, setAvatarPop] = useState<null | 'menu' | 'icons'>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmName, setConfirmName] = useState(false)

  const uname = username.trim().toLowerCase()
  const valid = USERNAME_RE.test(uname)
  const nameChanged = !!p && uname !== p.username
  // everything except the username saves itself once the profile exists
  const pending = !!p && (name.trim() !== p.display_name || status.trim() !== p.status || emoji !== p.avatar_emoji || color !== p.avatar_color || photo !== (p.avatar_url ?? null))

  // the file dialog takes the pointer away, which would otherwise close the card under it
  const openPicker = () => {
    onHold(true)
    window.addEventListener('focus', () => setTimeout(() => onHold(false), 1500), { once: true })
    fileInput.current?.click()
  }

  // free the previous pick's memory when it is replaced, dropped or the editor closes
  useEffect(
    () => () => {
      if (!source) return
      URL.revokeObjectURL(source.url)
      source.bitmap.close()
    },
    [source],
  )

  useEffect(() => {
    if (source) setPhoto(cropPhoto(source.bitmap, crop))
  }, [source, crop])

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      const bitmap = await createImageBitmap(file)
      setSource({ url: URL.createObjectURL(file), bitmap })
      setCrop(NO_CROP)
      setCropping(true)
      setMsg(null)
    } catch {
      play('error', { emphasis: 'subtle' })
      setMsg("That file couldn't be read as an image")
    }
  }

  const removePhoto = () => {
    setSource(null)
    setCropping(false)
    setPhoto(null)
  }

  const commit = async (patch: Parameters<Auth['saveProfile']>[0], done?: () => void) => {
    setBusy(true)
    const err = await auth.saveProfile(patch)
    play(err ? 'error' : 'success', { emphasis: 'subtle' })
    setMsg(err ?? 'Saved')
    if (!err) done?.()
    setBusy(false)
  }

  const cancelRename = () => {
    setUsername(p?.username ?? '')
    setConfirmName(false)
    setRenaming(false)
  }

  const saveName = () => {
    setName(nameDraft)
    setEditName(false)
  }

  // the popups sit on the whole expanded island so the scrolling list doesn't clip them
  const host = root.current?.closest('.expanded') ?? null

  const create = () =>
    commit({ username: uname, display_name: name.trim(), status: status.trim(), avatar_emoji: emoji, avatar_color: color, avatar_url: photo })

  const changeUsername = () =>
    commit({ username: uname }, () => {
      setConfirmName(false)
      setRenaming(false)
    })

  // auto-save edits shortly after the last keystroke; a photo waits until its crop is done
  useEffect(() => {
    if (!p || !pending || cropping) return
    const t = setTimeout(
      () => commit({ display_name: name.trim(), status: status.trim(), avatar_emoji: emoji, avatar_color: color, avatar_url: photo }),
      700,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, status, emoji, color, photo, cropping, pending])

  return (
    <div className="profile-edit" ref={root}>
      <div className="profile-card">
        <div className="avatar-edit">
          <Avatar profile={{ avatar_emoji: emoji, avatar_color: color, avatar_url: photo }} size={92} presence={p ? presenceOf(p) : undefined} />
          <div className="avatar-overlay">
            <button className="ao-text" data-cuelume-open onClick={() => setAvatarPop('menu')}>
              Change avatar
            </button>
            {/* until it is saved, a fresh photo can be re-cropped from here */}
            {source && !cropping ? (
              <button className="ao-pen" aria-label="Adjust photo" title="Adjust photo" data-cuelume-open onClick={() => setCropping(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                  <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                </svg>
              </button>
            ) : (
              <button className="ao-pen" aria-label="Change avatar" data-cuelume-open onClick={() => setAvatarPop('menu')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  <path d="m14.5 5.5 3 3" />
                </svg>
              </button>
            )}
            {photo ? (
              <button className="ao-text" data-cuelume-close data-cuelume-emphasis="subtle" onClick={removePhoto}>
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
          <b>
            {name.trim() || (uname ? `@${uname}` : 'New profile')}
            {p && (
              <button className="rename-btn" aria-label="Change display name" title="Change display name" data-cuelume-open onClick={() => {
                  setNameDraft(name)
                  setEditName(true)
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                    <path d="m14.5 5.5 3 3" />
                  </svg>
              </button>
            )}
          </b>
          {uname && (
            <span className="profile-handle">
              @{p?.username ?? uname}
              {p && (
                <button className="rename-btn" aria-label="Change username" title="Change username" data-cuelume-open onClick={() => setRenaming(true)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                    <path d="m14.5 5.5 3 3" />
                  </svg>
                </button>
              )}
            </span>
          )}
          {status.trim() && <span className="profile-status">{status.trim()}</span>}
          <small>{auth.user?.email}</small>
        </div>
        {p && (
          <button className="chip" data-cuelume-close onClick={auth.signOut}>
            Sign out
          </button>
        )}
      </div>

      {source && cropping && <PhotoCropper source={source} crop={crop} onChange={setCrop} onDone={() => setCropping(false)} />}

      {!p && <div className="form-msg">Pick a username so friends can find you.</div>}

      {!p && (
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
            autoFocus={!!p}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, ''))}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') cancelRename()
              if (e.key === 'Enter' && p && valid && nameChanged) setConfirmName(true)
            }}
          />
        </div>
        <small className={uname && !valid ? 'bad' : ''}>3–20 letters, numbers or _. Friends add you with this.</small>
        </div>
      )}

      {!p && (
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
      )}

      {avatarPop && host && createPortal(
        <div className="cp-pop" onClick={(e) => { e.stopPropagation(); setAvatarPop(null) }}>
          <div className="rename-pop avatar-pop" onClick={(e) => e.stopPropagation()}>
            <div className="ap-head">
              <b>{avatarPop === 'menu' ? 'Change avatar' : 'Choose an icon'}</b>
              <button className="ap-close" aria-label="Close" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setAvatarPop(null)}>
                ✕
              </button>
            </div>
            {avatarPop === 'menu' ? (
              <div className="ap-tiles">
                <button
                  className="ap-tile"
                  data-cuelume-open
                  onClick={() => {
                    setAvatarPop(null)
                    openPicker()
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                    <path d="m3 16 5-5 4 4" />
                    <path d="M18 2v6M15 5h6" />
                  </svg>
                  Upload photo
                </button>
                <button className="ap-tile" data-cuelume-open onClick={() => setAvatarPop('icons')}>
                  <span className="ap-tile-icon" style={{ background: color }}>
                    {emoji}
                  </span>
                  Choose icon
                </button>
              </div>
            ) : (
              <>
                <div className="ap-preview">
                  <Avatar profile={{ avatar_emoji: emoji, avatar_color: color, avatar_url: photo }} size={56} />
                </div>
                <div className="emoji-grid">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={!photo && e === emoji ? 'active' : ''}
                      data-cuelume-select
                      onClick={() => {
                        setEmoji(e)
                        if (photo) removePhoto()
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="swatches">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      className={c === color ? 'active' : ''}
                      data-cuelume-select
                      style={{ background: c }}
                      onClick={() => {
                        setColor(c)
                        if (photo) removePhoto()
                      }}
                    />
                  ))}
                </div>
                <div className="presets">
                  <button className="pill-btn" data-cuelume-tap onClick={() => setAvatarPop(null)}>
                    Done
                  </button>
                  <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setAvatarPop('menu')}>
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        host,
      )}

      {p && renaming && host && createPortal(
        <div className="cp-pop" onClick={(e) => { e.stopPropagation(); cancelRename() }}>
          <div className="rename-pop" onClick={(e) => e.stopPropagation()}>
            {confirmName ? (
              <>
                <b>Change username?</b>
                <small>
                  Your username becomes @{uname}. Friends will need the new one to find you, and @{p.username} may be taken by someone else.
                </small>
                <div className="presets">
                  <button className="pill-btn" disabled={busy} data-cuelume-tap onClick={changeUsername}>
                    Yes, change it
                  </button>
                  <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={cancelRename}>
                    Keep @{p.username}
                  </button>
                </div>
              </>
            ) : (
              <>
                <b>Change username</b>
        <div className="at-input">
          <span>@</span>
          <input
            className="todo-input"
            placeholder="yourname"
            value={username}
            data-cuelume-type
            maxLength={20}
            autoFocus={!!p}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, ''))}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') cancelRename()
              if (e.key === 'Enter' && p && valid && nameChanged) setConfirmName(true)
            }}
          />
        </div>
        <small className={uname && !valid ? 'bad' : ''}>3–20 letters, numbers or _. Friends add you with this.</small>
                <div className="presets">
                  <button className="pill-btn" disabled={!valid || !nameChanged || busy} data-cuelume-tap onClick={() => setConfirmName(true)}>
                    Continue
                  </button>
                  <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={cancelRename}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        host,
      )}

      {p && editName && host && createPortal(
        <div className="cp-pop" onClick={(e) => { e.stopPropagation(); setEditName(false) }}>
          <div className="rename-pop" onClick={(e) => e.stopPropagation()}>
            <b>Change display name</b>
            <input
              className="todo-input"
              placeholder="Shown to your friends"
              value={nameDraft}
              data-cuelume-type
              maxLength={40}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') setEditName(false)
                if (e.key === 'Enter') saveName()
              }}
            />
            <div className="presets">
              <button className="pill-btn" data-cuelume-tap onClick={saveName}>
                Save
              </button>
              <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => setEditName(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        host,
      )}

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
        <label>Status</label>
        <StatusField value={status} onChange={setStatus} />
      </div>

      {!p && (
        <div className="profile-actions">
          <button className="pill-btn" disabled={!valid || busy} data-cuelume-tap onClick={create}>
            Create profile
          </button>
          {msg && <span className="form-msg">{msg}</span>}
        </div>
      )}
      {p && msg && <div className="form-msg">{msg}</div>}

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
      {CAMPUS && <StudentCard student={props.student} onHold={props.onHold} />}
    </div>
  )
}
