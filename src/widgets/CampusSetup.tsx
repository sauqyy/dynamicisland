import { useState } from 'react'
import { play } from 'cuelume'
import { Check, ExternalLink, Lock } from 'lucide-react'
import type { StudentState } from '../lib/sso'
import type { SceleState } from '../lib/useScele'
import { UI_YELLOW, UiLogo } from './UiLogo'

interface Props {
  student: StudentState
  scele: SceleState
  /** opens SSO UI in the browser and waits for it (keeps the island open meanwhile) */
  verify: () => Promise<void>
  /** the setup is finished and the user has seen it: put away for good */
  onDone: () => void
}

/**
 * Connecting Universitas Indonesia in one place, three steps:
 * 1. SSO UI, in the user's own web browser: the island never sees that password (as RFC 8252
 *    advises for apps signing in), and SSO UI's page shows its real address there.
 * 2 and 3. SCELE and SLCM, with one password typed once. SCELE only issues app tokens for a password
 *    (it has no SSO sign-in for apps), and the same password signs in to UI's login for SLCM in the
 *    island's own SLCM window. It's sent to those two addresses only, over HTTPS, and never kept:
 *    the field is emptied the moment Connect is pressed, and Rust wipes its copy once it's used.
 */
export function CampusSetup({ student, scele, verify, onDone }: Props) {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState<null | 'sso' | 'connect'>(null)
  const [error, setError] = useState<string | null>(null)

  const s = student.student
  const verified = Boolean(s?.fasilkom)
  // SSO UI vouched for the account but sent no faculty: SCELE confirms it in step 2
  const confirming = Boolean(s?.needs_scele)
  const signedIn = verified || confirming
  const sceleOk = Boolean(scele.account)
  const slcmOk = Boolean(scele.slcm)
  const reading = scele.slcmStage !== null
  const allDone = verified && sceleOk && slcmOk

  const signInSso = async () => {
    setBusy('sso')
    setError(null)
    try {
      await verify()
    } catch (e) {
      play('error', { emphasis: 'subtle' })
      setError(typeof e === 'string' ? e : 'SSO UI sign-in failed')
    } finally {
      setBusy(null)
    }
  }

  const connect = async () => {
    if (!pass || busy) return
    // the password lives in this one call: the field is emptied straight away
    const password = pass
    setPass('')
    setBusy('connect')
    setError(null)
    try {
      if (!sceleOk) {
        if (confirming) await student.confirm(password)
        else await scele.login(password)
      }
      if (!slcmOk) {
        const r = await scele.connectSlcm(password)
        if (r === 'closed') setError('The SLCM window closed before your timetable came through. Try again from Classes.')
      }
      play('success')
    } catch (e) {
      play('error', { emphasis: 'subtle' })
      setError(typeof e === 'string' ? e : 'Sign-in failed. Check your SSO UI password and try again.')
    } finally {
      setBusy(null)
    }
  }

  if (allDone)
    return (
      <div className="cs cs-done">
        <span className="cs-head">
          <UiLogo size={26} color={UI_YELLOW} />
          <span>
            <b>You're all set</b>
            <small>Universitas Indonesia is connected. From now on:</small>
          </span>
        </span>
        <ul className="cs-after">
          <li>An alert before each class, with its room and topic</li>
          <li>Reminders before every deadline, which stop once you submit</li>
          <li>New materials and announcements, checked every 10 minutes</li>
          <li>Profile lists everything kept on this computer, with one button to disconnect it all</li>
        </ul>
        <button className="pill-btn primary" data-cuelume-close onClick={onDone}>
          Got it
        </button>
      </div>
    )

  const step = (n: number, done: boolean, now: boolean, title: string, sub: string) => (
    <li className={`cs-step ${done ? 'done' : now ? 'now' : ''}`}>
      <span className="cs-n">{done ? <Check size={12} strokeWidth={3} aria-hidden /> : n}</span>
      <span className="cs-text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </li>
  )

  return (
    <div className="cs" onKeyDown={(e) => e.stopPropagation()}>
      <span className="cs-head">
        <UiLogo size={26} color={UI_YELLOW} />
        <span>
          <b>Connect Universitas Indonesia</b>
          <small>Three steps, about two minutes. Each one is yours to undo on Profile.</small>
        </span>
      </span>
      <ol className="cs-steps">
        {step(1, verified, !signedIn, verified ? `Signed in as ${s?.name || s?.username}` : 'Sign in with SSO UI', verified ? 'Verified at Fasilkom' : confirming ? 'SSO UI knows you; SCELE confirms Fasilkom in the next step' : 'Unlocks Campus: classes, deadlines and course updates')}
        {step(2, sceleOk, signedIn && !sceleOk, sceleOk ? 'SCELE connected' : 'Connect SCELE', 'Deadlines, submissions, grades and course pages')}
        {step(3, slcmOk, signedIn && sceleOk && !slcmOk, slcmOk ? 'Timetable read from SLCM' : 'Read your timetable', reading ? 'Reading SLCM… its site is slow, so this can take a minute' : 'Each class\'s day, time and room, from SLCM')}
      </ol>

      {!signedIn && (
        <div className="cs-act">
          <button className="pill-btn primary" disabled={busy !== null || student.student === undefined} data-cuelume-open onClick={signInSso}>
            <ExternalLink size={13} aria-hidden /> {busy === 'sso' ? 'Waiting for SSO UI…' : 'Sign in with SSO UI'}
          </button>
          <small className="cs-secure">
            <Lock size={10} aria-hidden /> Opens <b>sso.ui.ac.id</b> in your web browser. You type the password there, so the island never sees it.
          </small>
        </div>
      )}

      {signedIn && (!sceleOk || !slcmOk) && !reading && (
        <div className="cs-act">
          <div className="cs-row">
            <input
              className="todo-input"
              type="password"
              aria-label="SSO UI password"
              placeholder="SSO UI password"
              autoComplete="current-password"
              value={pass}
              data-cuelume-type
              disabled={busy !== null}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
            />
            <button className="pill-btn primary" disabled={!pass || busy !== null} data-cuelume-tap onClick={connect}>
              {busy === 'connect' ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          <small className="cs-secure">
            <Lock size={10} aria-hidden /> Used once, then forgotten. Sent only over encrypted connections, to{' '}
            {!sceleOk && <b>scele.cs.ui.ac.id</b>}
            {!sceleOk && !slcmOk && ' and '}
            {!slcmOk && <b>login.ui.ac.id</b>}
            {!sceleOk && !slcmOk ? ', for SCELE and for SLCM' : !sceleOk ? ', for SCELE' : ', for SLCM'}. SCELE gives back a token, kept in your system's credential store; the password isn't saved anywhere.
          </small>
        </div>
      )}

      {reading && (
        <div className="cs-act">
          <small className={scele.slcmStage === 'needs-you' ? 'sc-warn' : 'sc-progress'}>
            {scele.slcmStage === 'needs-you' ? 'SLCM needs you: finish signing in in its window.' : 'Signed in. Reading your timetable from SLCM…'}
          </small>
          <span className="sc-chips">
            <button className={`chip ${scele.slcmStage === 'needs-you' ? 'on' : ''}`} data-cuelume-open onClick={() => scele.showSlcm()}>
              Show window
            </button>
          </span>
        </div>
      )}

      {error && <small className="sc-error">{error}</small>}
    </div>
  )
}
