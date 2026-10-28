import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Profile } from '../lib/supabase'
import { Avatar } from './Avatar'
import { HangUpIcon, HeadphonesIcon, MicIcon } from './CallBar'
import { GroupIcon } from './GroupsWidget'
import { own } from './IncomingCall'

interface Props {
  profile?: Profile
  group?: { emoji: string; color: string }
  /** the call timer, or what is happening before it starts ("Calling…") */
  label: ReactNode
  /** mute and deafen only make sense once audio flows */
  controls: boolean
  muted: boolean
  deafened: boolean
  /** your microphone, to draw the live waveform from */
  micStream: () => MediaStream | null
  onMute: () => void
  onDeafen: () => void
  onEnd: () => void
  /** group calls: who is in the voice chat, shown while the pill is hovered */
  people?: Profile[]
  me?: string
}

const BAR_COUNT = 5

/** Bars that follow your microphone level; they sit flat while you are muted or silent. */
function MicWave({ micStream, silent }: { micStream: () => MediaStream | null; silent: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const reset = () => bars.current.forEach((b) => b?.style.setProperty('--h', '0.12'))
    const stream = micStream()
    if (silent || !stream) {
      reset()
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    // voice sits in the low bins; give each bar its own slice so they move independently
    const slice = 4
    let raf = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      bars.current.forEach((b, i) => {
        let sum = 0
        for (let k = 0; k < slice; k++) sum += data[1 + i * slice + k]
        const v = Math.min(1, (sum / slice / 255) * 1.6)
        b?.style.setProperty('--h', String(Math.max(0.12, v)))
      })
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      ctx.close().catch(() => {})
      reset()
    }
  }, [micStream, silent])

  return (
    <span className={`mic-wave ${silent ? 'off' : ''}`} aria-hidden>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <i key={i} ref={(el) => void (bars.current[i] = el)} />
      ))}
    </span>
  )
}

/** The collapsed island while you are in a call: who, how long, and the controls. */
export function InCallPill({ profile, group, label, controls, muted, deafened, micStream, onMute, onDeafen, onEnd, people, me }: Props) {
  return (
    <div className="incall-col">
    <div className="incall">
      {profile ? <Avatar profile={profile} size={26} /> : group ? <GroupIcon group={group} size={26} /> : null}
      <span className="incall-time">{label}</span>
      {controls && <MicWave micStream={micStream} silent={muted || deafened} />}
      {controls && (
        <>
          <button className={`pill-ico ${muted ? 'on' : ''}`} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} data-cuelume-toggle {...own(onMute)}>
            <MicIcon off={muted} />
          </button>
          <button className={`pill-ico ${deafened ? 'on' : ''}`} aria-pressed={deafened} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'} data-cuelume-toggle {...own(onDeafen)}>
            <HeadphonesIcon off={deafened} />
          </button>
        </>
      )}
      <button className="pill-ico end" aria-label="End call" title="End call" data-cuelume-close data-cuelume-emphasis="subtle" {...own(onEnd)}>
        <HangUpIcon />
      </button>
    </div>
    {people && people.length > 0 && (
      <div className="incall-people" role="list" aria-label="In the voice chat">
        {people.map((p) => (
          <span key={p.id} className="incall-person" role="listitem" title={p.display_name || `@${p.username}`}>
            <Avatar profile={p} size={22} />
            <span>{p.id === me ? 'You' : p.display_name || `@${p.username}`}</span>
          </span>
        ))}
      </div>
    )}
    </div>
  )
}
