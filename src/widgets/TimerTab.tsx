import { useEffect, useRef, useState } from 'react'
import { Ring, TimerWidget } from './TimerWidget'
import { fmt } from './MediaWidget'
import type { PomodoroState, StopwatchState, TimerState } from '../types'

export type ClockMode = 'timer' | 'stopwatch' | 'pomodoro'

function fmtMs(ms: number) {
  const cs = Math.floor(ms / 10) % 100
  const s = Math.floor(ms / 1000) % 60
  const m = Math.floor(ms / 60000)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function elapsed(sw: StopwatchState, now = Date.now()) {
  return sw.base + (sw.running ? now - sw.startedAt : 0)
}

interface StopwatchProps {
  sw: StopwatchState
  setSw: (s: StopwatchState) => void
}

function Stopwatch({ sw, setSw }: StopwatchProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!sw.running) return
    const id = setInterval(() => setNow(Date.now()), 40)
    return () => clearInterval(id)
  }, [sw.running])

  const total = elapsed(sw, sw.running ? now : undefined)

  const toggle = () =>
    setSw(
      sw.running
        ? { ...sw, running: false, base: elapsed(sw) }
        : { ...sw, running: true, startedAt: Date.now() },
    )
  const lapOrReset = () =>
    sw.running
      ? setSw({ ...sw, laps: [elapsed(sw), ...sw.laps] })
      : setSw({ running: false, startedAt: 0, base: 0, laps: [] })

  return (
    <div className="stopwatch">
      <div className="sw-time">{fmtMs(total)}</div>
      <div className="presets">
        <button className="pill-btn" onClick={lapOrReset} disabled={!sw.running && total === 0}>
          {sw.running ? 'Lap' : 'Reset'}
        </button>
        <button className="pill-btn" onClick={toggle}>
          {sw.running ? 'Stop' : 'Start'}
        </button>
      </div>
      <div className="laps">
        {sw.laps.map((l, i) => (
          <div key={sw.laps.length - i} className="lap">
            <span>Lap {sw.laps.length - i}</span>
            <span>{fmtMs(l - (sw.laps[i + 1] ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The Pomodoro ring: on a phase change it drains to empty in the old colour, then refills in the new phase's colour. */
function PomoRing({ fraction, phase, phaseKey }: { fraction: number; phase: PomodoroState['phase']; phaseKey: string }) {
  const [step, setStep] = useState<'idle' | 'out' | 'in'>('idle')
  const [shownPhase, setShownPhase] = useState(phase)
  const lastKey = useRef(phaseKey)
  useEffect(() => {
    if (lastKey.current === phaseKey) return
    lastKey.current = phaseKey
    setStep('out')
    const refill = setTimeout(() => {
      setShownPhase(phase)
      setStep('in')
    }, 520)
    const done = setTimeout(() => setStep('idle'), 520 + 1150)
    return () => {
      clearTimeout(refill)
      clearTimeout(done)
    }
  }, [phaseKey, phase])
  return <Ring fraction={step === 'out' ? 0 : fraction} size={76} stroke={6} className={`pomo-ring ${step} ${shownPhase}`} />
}

const PHASE_LABEL = { focus: 'Focus', break: 'Short break', long: 'Long break' } as const

function Pomodoro({
  pomo,
  timer,
  now,
  onStart,
  onStop,
  onSkip,
}: {
  pomo: PomodoroState | null
  timer: TimerState | null
  now: number
  onStart: () => void
  onStop: () => void
  onSkip: () => void
}) {
  if (!pomo || !timer) {
    return (
      <div className="timer">
        <div className="timer-label">25 min focus · 5 min break · long break every 4</div>
        <button className="pill-btn" onClick={onStart}>Start focus</button>
      </div>
    )
  }
  const remaining = Math.max(0, (timer.endsAt - now) / 1000)
  // changes on every phase switch (skipped or finished), so the pieces below replay their entrance
  const phaseKey = `${pomo.phase}-${pomo.done}`
  return (
    <div className="timer pomo-run">
      <div className="timer-ring">
        <PomoRing fraction={remaining / (timer.total / 1000)} phase={pomo.phase} phaseKey={phaseKey} />
        <div className="timer-time pomo-swap" key={phaseKey}>{fmt(Math.ceil(remaining))}</div>
      </div>
      <div className="pomo-side">
        <div className={`timer-label pomo-swap ${pomo.phase}`} key={phaseKey}>
          {PHASE_LABEL[pomo.phase]} · {pomo.done} done
        </div>
        <div className="presets">
          <button className="pill-btn" onClick={onSkip}>Skip</button>
          <button className="pill-btn danger" onClick={onStop}>Stop</button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  mode: ClockMode
  setMode: (m: ClockMode) => void
  timer: TimerState | null
  now: number
  onStart: (minutes: number) => void
  onCancel: () => void
  sw: StopwatchState
  setSw: (s: StopwatchState) => void
  pomo: PomodoroState | null
  onPomoStart: () => void
  onPomoStop: () => void
  onPomoSkip: () => void
}

const MODE_LABEL: Record<ClockMode, string> = { timer: 'Timer', stopwatch: 'Stopwatch', pomodoro: 'Pomodoro' }

export function TimerTab({
  mode,
  setMode,
  timer,
  now,
  onStart,
  onCancel,
  sw,
  setSw,
  pomo,
  onPomoStart,
  onPomoStop,
  onPomoSkip,
}: Props) {
  return (
    <div className="timer-tab" onClick={(e) => e.stopPropagation()}>
      <div className="segmented">
        {(['timer', 'pomodoro', 'stopwatch'] as const).map((m) => (
          <button key={m} className={m === mode ? 'active' : ''} onClick={() => setMode(m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {mode === 'timer' && (
        <TimerWidget timer={pomo ? null : timer} now={now} onStart={onStart} onCancel={onCancel} />
      )}
      {mode === 'pomodoro' && (
        <Pomodoro pomo={pomo} timer={timer} now={now} onStart={onPomoStart} onStop={onPomoStop} onSkip={onPomoSkip} />
      )}
      {mode === 'stopwatch' && <Stopwatch sw={sw} setSw={setSw} />}
    </div>
  )
}
