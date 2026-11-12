import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CustomTime, Ring } from './TimerWidget'
import { fmt } from './MediaWidget'
import { POMO_MIN, type PomodoroState, type StopwatchState, type TimerState } from '../types'

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

const MODES: ClockMode[] = ['timer', 'stopwatch', 'pomodoro']
const MODE_LABEL: Record<ClockMode, string> = { timer: 'Timer', stopwatch: 'Stopwatch', pomodoro: 'Pomodoro' }
const PRESETS = [5, 10, 15, 25, 45, 60]
const RING = 136

/** The mode switch. It always sits in the same corner, so it does not move when the page below it changes. */
function Modes({ mode, setMode }: { mode: ClockMode; setMode: (m: ClockMode) => void }) {
  return (
    <div className="tt-modes" role="tablist" aria-label="Clock">
      {MODES.map((m) => (
        <button key={m} role="tab" aria-selected={m === mode} className={m === mode ? 'on' : ''} data-cuelume-select onClick={() => setMode(m)}>
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

/** A ring with its digits inside, and whatever goes beside it. */
function Dial({ ring, digits, label, info }: { ring: ReactNode; digits: ReactNode; label: ReactNode; info: ReactNode }) {
  return (
    <div className="tt-main">
      <div className="tt-ring">
        {ring}
        <div className="tt-dig">
          <b>{digits}</b>
          <small>{label}</small>
        </div>
      </div>
      <div className="tt-info">{info}</div>
    </div>
  )
}

function TimerView({ modes, timer, now, onStart, onCancel }: { modes: ReactNode; timer: TimerState | null; now: number; onStart: (m: number) => void; onCancel: () => void }) {
  const remaining = timer ? Math.max(0, (timer.endsAt - now) / 1000) : 0
  const fraction = timer ? remaining / (timer.total / 1000) : 0
  const mins = timer ? Math.round(timer.total / 60000) : 0
  const endsAt = timer ? new Date(timer.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
  return (
    <>
      <div className="tt-left">
        {modes}
        <span className="tt-h">Minutes</span>
        <div className="tt-chips">
          {PRESETS.map((m) => (
            <button key={m} className={`tt-chip ${mins === m ? 'on' : ''}`} aria-pressed={mins === m} data-cuelume-tap onClick={() => onStart(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <Dial
        ring={<Ring fraction={fraction} size={RING} stroke={7} />}
        digits={timer ? fmt(Math.ceil(remaining)) : '0:00'}
        label={timer ? `of ${fmt(Math.round(timer.total / 1000))}` : 'Pick a time'}
        info={
          timer ? (
            <>
              <span className="tt-h">Ends at</span>
              <b className="tt-big">{endsAt}</b>
              <span className="tt-note">The pill keeps a bubble on its right while it runs.</span>
            </>
          ) : (
            <span className="tt-note">Pick a length, or type your own on the right.</span>
          )
        }
      />
      <div className="tt-right">
        {timer ? (
          <button className="tt-btn ghost" data-cuelume-close onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <>
            <span className="tt-h">Your own time</span>
            <CustomTime onStart={onStart} />
          </>
        )}
      </div>
    </>
  )
}

function StopwatchView({ modes, sw, setSw }: { modes: ReactNode; sw: StopwatchState; setSw: (s: StopwatchState) => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!sw.running) return
    const id = setInterval(() => setNow(Date.now()), 40)
    return () => clearInterval(id)
  }, [sw.running])

  const total = elapsed(sw, sw.running ? now : undefined)
  const turn = ((total / 1000) % 60) / 60
  const splits = sw.laps.map((l, i) => l - (sw.laps[i + 1] ?? 0))
  const best = Math.min(...splits)
  const worst = Math.max(...splits)
  const current = total - (sw.laps[0] ?? 0)

  const toggle = () => setSw(sw.running ? { ...sw, running: false, base: elapsed(sw) } : { ...sw, running: true, startedAt: Date.now() })
  const lapOrReset = () => (sw.running ? setSw({ ...sw, laps: [elapsed(sw), ...sw.laps] }) : setSw({ running: false, startedAt: 0, base: 0, laps: [] }))

  return (
    <>
      <div className="tt-left">
        {modes}
        <span className="tt-h">Laps</span>
        <span className="tt-note">Lap marks a split and keeps counting.</span>
      </div>
      <Dial
        ring={<Ring fraction={turn} size={RING} stroke={7} />}
        digits={<span className="tt-sw">{fmtMs(total)}</span>}
        label="one turn is a minute"
        info={
          <>
            <span className="tt-h">Lap {sw.laps.length + 1}</span>
            <b className="tt-big">{fmtMs(current)}</b>
            <div className="tt-laps">
              {sw.laps.length === 0 ? (
                <span className="tt-note">Press Lap to mark a split.</span>
              ) : (
                splits.slice(0, 3).map((s, i) => (
                  <div key={sw.laps.length - i} className={`tt-lap ${sw.laps.length > 2 && s === best ? 'best' : sw.laps.length > 2 && s === worst ? 'worst' : ''}`}>
                    <span>Lap {sw.laps.length - i}</span>
                    <b>{fmtMs(s)}</b>
                  </div>
                ))
              )}
            </div>
          </>
        }
      />
      <div className="tt-right">
        <button className="tt-btn" onClick={toggle} aria-pressed={sw.running} data-cuelume-toggle>
          {sw.running ? 'Stop' : total > 0 ? 'Resume' : 'Start'}
        </button>
        <button className="tt-btn ghost" onClick={lapOrReset} disabled={!sw.running && total === 0} {...(sw.running ? { 'data-cuelume-tap': '' } : { 'data-cuelume-close': '' })} data-cuelume-emphasis="subtle">
          {sw.running ? 'Lap' : 'Reset'}
        </button>
      </div>
    </>
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
  return <Ring fraction={step === 'out' ? 0 : fraction} size={RING} stroke={7} className={`pomo-ring ${step} ${shownPhase}`} />
}

/** A line that slides in over the page when the phase changes, since the pill's own alert hides while the card is open. */
function PhaseToast({ phase, phaseKey, done }: { phase: PomodoroState['phase']; phaseKey: string; done: number }) {
  const [shown, setShown] = useState('')
  const last = useRef(phaseKey)
  useEffect(() => {
    if (last.current === phaseKey) return
    last.current = phaseKey
    setShown(phaseKey)
    const id = setTimeout(() => setShown(''), 3800)
    return () => clearTimeout(id)
  }, [phaseKey])
  if (!shown) return null
  const [title, sub] =
    phase === 'focus'
      ? ['Back to focus', `Session ${(done % 4) + 1} of 4 starts now, ${POMO_MIN.focus} min`]
      : phase === 'long'
        ? ['Long break, you earned it', `Four sessions done. Rest for ${POMO_MIN.long} min`]
        : ['Time for a break', `You focused for ${POMO_MIN.focus} min. Rest for ${POMO_MIN.break}`]
  return (
    <div className="tt-toast" key={shown} role="status">
      <b>{title}</b>
      <small>{sub}</small>
    </div>
  )
}

const PHASE_TITLE = { focus: 'Focus', break: 'Break, look away from the screen', long: 'Long break, you earned it' } as const

function PomodoroView({
  modes,
  pomo,
  timer,
  now,
  task,
  setTask,
  suggestions,
  onStart,
  onStop,
  onSkip,
}: {
  modes: ReactNode
  pomo: PomodoroState | null
  timer: TimerState | null
  now: number
  task: string
  setTask: (t: string) => void
  suggestions: string[]
  onStart: () => void
  onStop: () => void
  onSkip: () => void
}) {
  if (!pomo || !timer) {
    return (
      <>
        <div className="tt-left">
          {modes}
          <span className="tt-h">What are you working on?</span>
          <input
            className="tt-input"
            placeholder="Optional"
            value={task}
            maxLength={40}
            data-cuelume-type
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') onStart()
            }}
          />
          {suggestions.length > 0 && (
            <div className="tt-chips">
              {suggestions.slice(0, 4).map((s) => (
                <button key={s} className={`tt-chip ${task === s ? 'on' : ''}`} aria-pressed={task === s} data-cuelume-select onClick={() => setTask(task === s ? '' : s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <Dial
          ring={<Ring fraction={1} size={RING} stroke={7} />}
          digits={fmt(POMO_MIN.focus * 60)}
          label="ready"
          info={
            <>
              <span className="tt-h">The round</span>
              <b className="tt-big">
                {POMO_MIN.focus} / {POMO_MIN.break}
              </b>
              <span className="tt-note">
                {POMO_MIN.focus} min focus, {POMO_MIN.break} min break, and a {POMO_MIN.long} min break after every fourth session. You hear a chime when each phase ends.
              </span>
            </>
          }
        />
        <div className="tt-right">
          <button className="tt-btn" data-cuelume-tap onClick={onStart}>
            Start focus
          </button>
        </div>
      </>
    )
  }
  const remaining = Math.max(0, (timer.endsAt - now) / 1000)
  const phaseKey = `${pomo.phase}-${pomo.done}`
  const filled = pomo.phase === 'long' ? 4 : pomo.done % 4
  const next = pomo.phase === 'focus' ? ((pomo.done + 1) % 4 === 0 ? `${POMO_MIN.long} min long break` : `${POMO_MIN.break} min break`) : `${POMO_MIN.focus} min focus`
  return (
    <>
      <PhaseToast phase={pomo.phase} phaseKey={phaseKey} done={pomo.done} />
      <div className="tt-left">
        {modes}
        <span className="tt-h">Working on</span>
        <span className="tt-note tt-on">{task || 'No subject'}</span>
      </div>
      <Dial
        ring={<PomoRing fraction={remaining / (timer.total / 1000)} phase={pomo.phase} phaseKey={phaseKey} />}
        digits={<span className="pomo-swap" key={phaseKey}>{fmt(Math.ceil(remaining))}</span>}
        label={pomo.phase === 'focus' ? 'focus' : pomo.phase === 'break' ? 'break' : 'long break'}
        info={
          <>
            <div className="tt-dots" aria-label={`${filled} of 4 sessions done`}>
              {[0, 1, 2, 3].map((i) => (
                <i key={i} className={`${i < filled ? 'done' : ''} ${pomo.phase === 'focus' && i === filled ? 'cur' : ''}`} />
              ))}
            </div>
            <b className="tt-phase pomo-swap" key={phaseKey}>
              {pomo.phase === 'focus' ? `Focus, session ${filled + 1} of 4` : PHASE_TITLE[pomo.phase]}
            </b>
            <span className="tt-note">Next: {next}, starts by itself</span>
          </>
        }
      />
      <div className="tt-right">
        <button className="tt-btn ghost" data-cuelume-navigate data-cuelume-emphasis="subtle" onClick={onSkip}>
          {pomo.phase === 'focus' ? 'Skip to break' : 'Skip break'}
        </button>
        <button className="tt-btn ghost danger" data-cuelume-close onClick={onStop}>
          Stop
        </button>
      </div>
    </>
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
  /** what the focus session is for: a course or a deadline */
  task: string
  setTask: (t: string) => void
  taskSuggestions: string[]
  onPomoStart: () => void
  onPomoStop: () => void
  onPomoSkip: () => void
}

export function TimerTab({ mode, setMode, timer, now, onStart, onCancel, sw, setSw, pomo, task, setTask, taskSuggestions, onPomoStart, onPomoStop, onPomoSkip }: Props) {
  const modes = <Modes mode={mode} setMode={setMode} />
  return (
    <div className={`tt tt-${mode} ${mode === 'pomodoro' && pomo ? `phase-${pomo.phase}` : ''}`} onClick={(e) => e.stopPropagation()}>
      {mode === 'timer' && <TimerView modes={modes} timer={pomo ? null : timer} now={now} onStart={onStart} onCancel={onCancel} />}
      {mode === 'stopwatch' && <StopwatchView modes={modes} sw={sw} setSw={setSw} />}
      {mode === 'pomodoro' && (
        <PomodoroView modes={modes} pomo={pomo} timer={timer} now={now} task={task} setTask={setTask} suggestions={taskSuggestions} onStart={onPomoStart} onStop={onPomoStop} onSkip={onPomoSkip} />
      )}
    </div>
  )
}
