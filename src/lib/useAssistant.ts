import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { motionValue } from 'motion/react'
import { play } from 'cuelume'
import { invoke } from '@tauri-apps/api/core'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { IS_TAURI } from './useMedia'
import { openMic } from './audioDevices'
import type { TalkMode } from './settings'
import { converseLocal, type BrainSettings, type ChatMsg } from './assistantBrain'
import { fastPath, runAction, toolDefs, type ActionApi } from './actions'
import { claudeReady } from './claudeAccount'
import { parseIntent } from './intents'
import { getLlmStatus, llmReady, loadLlm } from './localBrain'
import { speak, type VoicePrefs } from './voice'
import { createRecorder, hasSpeech, sttReady, transcribe } from './speechToText'
import { neuralReady } from './neuralVoice'

/**
 * idle: nothing happening · listening: the mic is open · thinking: waiting for the answer
 * speaking: the reply is being said and typed · done: reply shown for a moment · error: something went wrong
 */
export type AssistantPhase = 'idle' | 'listening' | 'thinking' | 'confirm' | 'speaking' | 'done' | 'error'

/** One line of the conversation, as the Chat tab shows it (what you said or typed, and what Astra answered). */
export interface ChatLine {
  id: number
  role: 'user' | 'astra'
  text: string
  /** what it did on the computer ("Opening Spotify") */
  actions?: string[]
  /** the line is an error message, not an answer */
  error?: boolean
}

export interface AssistantState {
  phase: AssistantPhase
  /** what you said (filled in once speech-to-text exists) */
  heard: string
  /** what it answers, typed out while it speaks */
  reply: string
  /** length of the whole answer, so the card can be sized for it while it is still being typed */
  replyLen: number
  /** what it did on the computer, one short line each ("Opening Spotify") */
  actions: string[]
  /** the yes / no question while phase is 'confirm' */
  confirmText: string
  /** the microphone is really recording; until then the first words would be lost, so it asks to wait for the chime */
  armed: boolean
  error: string
}

/** Writes a line to the assistant's log file (in the temp folder) so a problem can be traced afterwards. */
const dlog = (line: string) => {
  if (IS_TAURI) invoke('assistant_log', { line }).catch(() => {})
}

/** Whether the assistant's shortcut could be bound, so Settings can say so when Windows or another app refuses it. */
let hotkeyState = { accel: '', ok: true, error: '' }
const hotkeySubs = new Set<() => void>()
const setHotkeyState = (s: typeof hotkeyState) => {
  hotkeyState = s
  hotkeySubs.forEach((f) => f())
}
export const useHotkeyStatus = () =>
  useSyncExternalStore(
    (f) => (hotkeySubs.add(f), () => void hotkeySubs.delete(f)),
    () => hotkeyState,
  )

let keyQueue: Promise<void> = Promise.resolve()
/** Binds a global shortcut. Bindings are applied one after another, and the latest one always wins. */
function bindKey(accel: string, handler: (e: { state: string }) => void, report = false): () => void {
  let live = true
  keyQueue = keyQueue.then(async () => {
    if (!live) return
    await unregister(accel).catch(() => {})
    try {
      await register(accel, (e) => live && handler(e))
      dlog(`hotkey registered: ${accel}`)
      if (report && live) setHotkeyState({ accel, ok: true, error: '' })
    } catch (e) {
      dlog(`hotkey FAILED to register (${accel}): ${String(e)}`)
      if (report && live) setHotkeyState({ accel, ok: false, error: 'Windows or another app is already using that shortcut. Pick a different one' })
    }
  })
  return () => {
    live = false
    keyQueue = keyQueue.then(() => unregister(accel).catch(() => {}))
  }
}

/** What went wrong with the microphone, in words a person can act on. */
function micProblem(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access is blocked. Allow it in Windows Settings > Privacy > Microphone, including for desktop apps'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found. Plug one in or pick another in Settings > Calls'
  if (name === 'NotReadableError' || name === 'AbortError') return 'Another app is using the microphone. Close it and try again'
  return typeof err === 'string' ? err : "I can't reach your microphone"
}

const IDLE: AssistantState = { phase: 'idle', heard: '', reply: '', replyLen: 0, actions: [], confirmText: '', armed: false, error: '' }
/** an unanswered question is treated as "no" after this long */
const CONFIRM_MS = 12_000
/** keys released sooner than this were a tap, not a hold */
const TAP_MS = 450

/** Shown by the demo buttons, which skip the real conversation. */
const PLACEHOLDER = "Hi! I'm listening. Ask me anything and I'll answer out loud."
/** pressing the hotkey again within this long carries on the same conversation */
const FOLLOW_UP_MS = 30_000
/** how many messages of the conversation Claude is shown */
const MAX_HISTORY = 12
/** how long the reply lingers once it has been said */
const LINGER = 3500
/** toggle mode stops by itself after this much quiet once you have started talking */
const SILENCE_MS = 1400
/** … or if you never start talking */
const NO_SPEECH_MS = 6000
const SPEECH_LEVEL = 0.12

interface Opts {
  enabled: boolean
  /** Tauri accelerator, e.g. 'Control+Shift+Space' */
  hotkey: string
  talk: TalkMode
  brain: BrainSettings
  voice: VoicePrefs & { enabled: boolean }
  /** a sentence about what is going on right now (time, what is playing), given to Claude with each question */
  getContext: () => string
  /** the parts of the app the assistant can operate */
  controls: Pick<ActionApi, 'startTimer' | 'addTodo' | 'isPlaying'>
  /** an answer to something typed in the Chat tab has arrived */
  onChatReply?: (text: string) => void
}

/** Does a browser key event match a Tauri accelerator? Only used by the browser demo, where there are no global keys. */
function matches(e: KeyboardEvent, accel: string) {
  const parts = accel.split('+').map((p) => p.trim().toLowerCase())
  const key = parts[parts.length - 1]
  const want = (m: string[]) => m.some((x) => parts.includes(x))
  if (want(['control', 'ctrl']) !== e.ctrlKey) return false
  if (want(['shift']) !== e.shiftKey) return false
  if (want(['alt', 'option']) !== e.altKey) return false
  if (want(['super', 'meta', 'command', 'cmd']) !== e.metaKey) return false
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase()
  return k === key || e.code.toLowerCase() === key || e.code.toLowerCase() === `key${key}`
}

/**
 * The talk-to-the-island state machine: a global hotkey wakes it, the mic level drives the glow and the
 * mascot while you talk, then it thinks and answers. `level` is a motion value so the 60fps meter never
 * re-renders React.
 */
/** how many bars the listening meter has */
export const BANDS = 9

/** FFT bin edges for BANDS bands spaced like pitch (about 100 Hz to 5 kHz), so every bar gets a fair share of a voice. */
function bandEdges(bins: number): number[] {
  const lo = Math.max(1, Math.round(bins * (100 / 8000)))
  const hi = Math.round(bins * (5000 / 8000))
  const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.round(lo * (hi / lo) ** (i / BANDS)))
  for (let i = 1; i < edges.length; i++) edges[i] = Math.max(edges[i], edges[i - 1] + 1)
  return edges
}

export function useAssistant({ enabled, hotkey, talk, brain, voice, getContext, controls, onChatReply }: Opts) {
  const [state, setState] = useState<AssistantState>(IDLE)
  const level = useMemo(() => motionValue(0), [])
  // the voice split into pitch bands (low to high) for the bar meter on the listening card
  const bands = useMemo(() => Array.from({ length: BANDS }, () => motionValue(0)), [])
  const stateRef = useRef(state)
  stateRef.current = state
  // the conversation so far, kept for the Chat tab; voice and typing add to the same one
  const [messages, setMessages] = useState<ChatLine[]>([])
  const lineId = useRef(0)
  const addLine = useCallback((line: Omit<ChatLine, 'id'>) => setMessages((m) => [...m.slice(-79), { ...line, id: ++lineId.current }]), [])
  const [chatBusy, setChatBusy] = useState(false)
  const chatBusyRef = useRef(false)
  const chatRun = useRef(0)
  const optsRef = useRef({ brain, voice, getContext, controls, onChatReply })
  optsRef.current = { brain, voice, getContext, controls, onChatReply }
  const confirmRes = useRef<((yes: boolean) => void) | null>(null)
  // hold-to-talk: when the keys are tapped instead of held, it keeps listening until you stop talking
  const downAt = useRef(0)
  const handsFree = useRef(false)
  // set the moment a recording is stopped, because the state still says 'listening' for a moment after
  const stopping = useRef(false)
  const history = useRef<ChatMsg[]>([])
  const lastReply = useRef(0)
  const stopSpeaking = useRef<() => void>(() => {})

  // everything that has to be torn down when a run ends or is cancelled
  const stream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const timers = useRef<number[]>([])
  const run = useRef(0)
  const speech = useRef<{ finish: () => Promise<string>; abort: () => void } | null>(null)

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const closeMic = useCallback(() => {
    clearInterval(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void audioCtx.current?.close().catch(() => {})
    audioCtx.current = null
  }, [])

  const reset = useCallback(() => {
    run.current++
    closeMic()
    speech.current?.abort()
    speech.current = null
    stopSpeaking.current()
    stopSpeaking.current = () => {}
    // a question nobody answered is a no
    confirmRes.current?.(false)
    confirmRes.current = null
    timers.current.forEach(clearTimeout)
    timers.current = []
    level.set(0)
    for (const b of bands) b.set(0)
  }, [closeMic, level, bands])

  const cancel = useCallback(() => {
    if (stateRef.current.phase === 'idle') return
    reset()
    play('close', { emphasis: 'subtle' })
    setState(IDLE)
  }, [reset])

  const fail = useCallback(
    (error: string) => {
      reset()
      play('error', { emphasis: 'subtle' })
      setState({ ...IDLE, phase: 'error', error })
      later(() => setState(IDLE), 3000)
    },
    [reset, later],
  )

  /** Shows the reply, typing it out in step with the voice, then lingers and goes back to sleep. */
  const present = useCallback(
    (text: string, id: number, actions: string[] = []) => {
      const v = optsRef.current.voice
      const talks = v.enabled
      setState((s) => ({ ...s, phase: 'speaking', reply: '', replyLen: text.length, actions, confirmText: '' }))
      let shown = 0
      const reveal = (n: number) => {
        if (run.current !== id || n <= shown) return
        shown = Math.min(n, text.length)
        setState((s) => ({ ...s, reply: text.slice(0, shown) }))
      }
      // the mouth moves while there is a voice; the exact loudness of a system voice is not available
      const mouth = window.setInterval(() => level.set(0.3 + Math.random() * 0.6), 90)
      timers.current.push(mouth)
      let typer = 0
      const finish = () => {
        window.clearInterval(typer)
        window.clearInterval(mouth)
        if (run.current !== id) return
        level.set(0)
        setState((s) => ({ ...s, phase: 'done', reply: text }))
        play('success', { emphasis: 'subtle' })
        later(() => run.current === id && setState(IDLE), LINGER + Math.min(5000, text.length * 25))
      }
      const typeAt = (cps: number) => {
        window.clearInterval(typer)
        typer = window.setInterval(() => {
          reveal(shown + 1)
          if (shown >= text.length && !talks) finish()
        }, 1000 / cps)
        timers.current.push(typer)
      }

      if (talks) {
        // the very first answer can arrive before the voice has finished loading: show the words now, speak when ready
        if (!neuralReady() && !v.cloud) typeAt(30)
        let started = false
        let boundaries = false
        // some engines never report which word they are on; then the text is typed at about the speaking pace
        const fallback = () => {
          if (!boundaries) typeAt(14 * v.rate)
        }
        stopSpeaking.current = speak(text, v, {
          onStart: () => {
            started = true
            later(fallback, 700)
          },
          onProgress: (f) => {
            boundaries = true
            window.clearInterval(typer)
            const at = Math.ceil(text.length * f)
            const end = text.indexOf(' ', at)
            reveal(end < 0 ? text.length : end)
          },
          onEnd: finish,
        })
        // the first sentence takes a moment to make: show the words meanwhile, and the audio catches up
        later(() => {
          if (!started) typeAt(30)
        }, 1500)
        // no voice at all: do not leave it silent and stuck
        later(() => {
          if (!started) {
            stopSpeaking.current()
            typeAt(30)
            later(finish, (text.length / 30) * 1000 + 200)
          }
        }, neuralReady() || v.cloud ? 8000 : 120_000)
      } else {
        typeAt(30)
      }
    },
    [later, level],
  )

  /** Asks a yes / no question on the island and waits for the answer (Esc and silence both mean no). */
  const confirm = useCallback(
    (question: string) =>
      new Promise<boolean>((resolve) => {
        confirmRes.current?.(false)
        confirmRes.current = resolve
        setState((s) => ({ ...s, phase: 'confirm', confirmText: question }))
        play('open', { emphasis: 'subtle' })
        later(() => {
          if (confirmRes.current === resolve) {
            confirmRes.current = null
            resolve(false)
          }
        }, CONFIRM_MS)
      }),
    [later],
  )
  const answerConfirm = useCallback((yes: boolean) => {
    const r = confirmRes.current
    confirmRes.current = null
    if (!r) return
    setState((s) => ({ ...s, phase: 'thinking', confirmText: '' }))
    r(yes)
  }, [])

  /**
   * Works out the answer to something said or typed: a simple command runs at once, anything else goes to the brain
   * (which may run commands too). Resolves null if it is no longer wanted; throws a sentence if it cannot.
   */
  const think = useCallback(
    async (heard: string, alive: () => boolean): Promise<{ text: string; actions: string[] } | null> => {
      // a new conversation if the last one has gone quiet
      if (Date.now() - lastReply.current > FOLLOW_UP_MS) history.current = []
      const o = optsRef.current
      const api: ActionApi = {
        settings: () => optsRef.current.brain,
        startTimer: (m) => optsRef.current.controls.startTimer(m),
        addTodo: (t) => optsRef.current.controls.addTodo(t),
        isPlaying: () => optsRef.current.controls.isPlaying(),
        confirm,
      }
      const remember = (reply: string) => {
        history.current.push({ role: 'user', content: heard }, { role: 'assistant', content: reply })
        lastReply.current = Date.now()
      }
      // "open Spotify", "volume up", "timer 5 minutes": simple commands run at once, without asking the brain
      const fast = await fastPath(heard, api)
      if (!alive()) return null
      if (fast) {
        remember(fast.reply)
        return { text: fast.reply, actions: fast.actions }
      }
      // Claude needs Claude Code to be installed and signed in; say so rather than fail mysteriously
      if (o.brain.assistantEngine === 'claude') {
        const acct = await claudeReady()
        if (!alive()) return null
        if (acct.state === 'missing') throw "Claude Code isn't installed. Install it, or switch to the built-in brain in Settings"
        if (acct.state === 'out') throw "You're not signed in to Claude. Sign in in Settings > Buddy"
      }
      // the built-in brain is a big download the first time; say so rather than leave it thinking for minutes
      if (o.brain.assistantEngine === 'local' && !llmReady(o.brain.assistantLocalModel)) {
        const st = getLlmStatus()
        if (st.state === 'error') throw st.error
        void loadLlm(o.brain.assistantLocalModel).catch(() => {})
        const mine = st.state === 'loading' && st.model === o.brain.assistantLocalModel
        const pct = mine && st.stage !== 'starting' && st.progress > 0 ? ` (${Math.round(st.progress * 100)}%)` : ''
        const how = mine && st.stage === 'starting' ? 'starting up' : 'getting ready'
        return { text: `I'm still ${how}${pct}. It only downloads once. Ask me again in a little while.`, actions: [] }
      }
      const turn = [...history.current.slice(-MAX_HISTORY), { role: 'user' as const, content: heard }]
      const result = await converseLocal(o.brain, turn, o.getContext(), toolDefs(o.brain).length > 0, async (command) => {
        if (!alive()) throw 'cancelled'
        // the brain writes commands in plain words; they are understood the same way as spoken ones
        const action = parseIntent(command, o.brain.assistantRoutines)
        if (!action) throw "I didn't understand " + command
        return runAction(action, api)
      })
      if (!alive()) return null
      remember(result.text)
      return result
    },
    [confirm],
  )

  /** thinking -> (a quick command, or ask the brain and run what it asks for) -> speaking -> done -> idle */
  const answer = useCallback(
    async (said?: string) => {
      const id = run.current
      const heard = (said ?? stateRef.current.heard).trim()
      dlog(`heard: "${heard}"`)
      setState((s) => ({ ...s, phase: 'thinking' }))
      level.set(0)
      if (!heard) return present("I didn't catch that. Could you say it again?", id)
      addLine({ role: 'user', text: heard })
      try {
        const r = await think(heard, () => run.current === id)
        if (!r) return
        addLine({ role: 'astra', text: r.text, actions: r.actions })
        present(r.text, id, r.actions)
      } catch (e) {
        if (run.current !== id) return
        const message = typeof e === 'string' ? e : 'Something went wrong'
        addLine({ role: 'astra', text: message, error: true })
        fail(message)
      }
    },
    [level, present, fail, think, addLine],
  )

  /** Typed into the Chat tab: the same brain and the same memory as the voice, with the answer written instead of spoken. */
  const sendChat = useCallback(
    async (raw: string, opts?: { speak?: boolean }) => {
      const heard = raw.trim()
      if (!heard || chatBusyRef.current) return
      chatBusyRef.current = true
      setChatBusy(true)
      addLine({ role: 'user', text: heard })
      const id = ++chatRun.current
      try {
        const r = await think(heard, () => chatRun.current === id)
        if (r) {
          addLine({ role: 'astra', text: r.text, actions: r.actions })
          optsRef.current.onChatReply?.(r.text)
          const v = optsRef.current.voice
          if (opts?.speak && v.enabled) {
            stopSpeaking.current()
            stopSpeaking.current = speak(r.text, v)
          }
        }
      } catch (e) {
        addLine({ role: 'astra', text: typeof e === 'string' ? e : 'Something went wrong', error: true })
      } finally {
        chatBusyRef.current = false
        setChatBusy(false)
      }
    },
    [think, addLine],
  )

  /** A fresh start: the written record and what the brain remembers are cleared. */
  const clearChat = useCallback(() => {
    chatRun.current++
    chatBusyRef.current = false
    setChatBusy(false)
    setMessages([])
    history.current = []
    lastReply.current = 0
  }, [])

  /**
   * Live transcript: the microphone is recorded, and every moment the audio so far is turned into words (on this
   * computer, with Whisper) and shown in state.heard. When you stop, the whole recording is transcribed once more.
   */
  const startSpeech = useCallback((ctx: AudioContext, source: MediaStreamAudioSourceNode, onText: (t: string) => void) => {
    const rec = createRecorder(ctx, source)
    let busy = false
    let lastLen = 0
    let done = false
    const partial = async () => {
      if (busy || done || !sttReady()) return
      const audio = rec.samples()
      if (audio.length < 16000 * 0.8 || audio.length === lastLen || !hasSpeech(audio)) return
      busy = true
      lastLen = audio.length
      try {
        const t = await transcribe(audio)
        if (!done) onText(t)
      } catch {
        /* the final transcription below reports any real problem */
      } finally {
        busy = false
      }
    }
    const iv = window.setInterval(() => void partial(), 1200)
    speech.current = {
      finish: () => {
        done = true
        window.clearInterval(iv)
        rec.stop()
        const audio = rec.samples()
        dlog(`recorded ${(audio.length / 16000).toFixed(1)}s, speech found: ${hasSpeech(audio)}`)
        if (audio.length < 16000 * 0.4 || !hasSpeech(audio)) return Promise.resolve('')
        const t0 = Date.now()
        return transcribe(audio).then((text) => {
          dlog(`transcribed in ${Date.now() - t0}ms: "${text}"`)
          onText(text)
          return text
        })
      },
      abort: () => {
        done = true
        window.clearInterval(iv)
        rec.stop()
      },
    }
  }, [])

  const stop = useCallback(() => {
    if (stateRef.current.phase !== 'listening' || stopping.current) return
    stopping.current = true
    const id = run.current
    // the recording is taken before the microphone is closed
    const sp = speech.current
    speech.current = null
    const words = sp ? sp.finish() : Promise.resolve('')
    closeMic()
    // the island shows it is thinking right away; the reply starts once the words are ready
    setState((s) => ({ ...s, phase: 'thinking' }))
    words.then(
      (text) => run.current === id && void answer(text),
      (e) => {
        dlog(`transcription failed: ${String(e)}`)
        if (run.current === id) fail('Speech recognition is not available yet. Check your internet connection for the first-time download')
      },
    )
  }, [closeMic, answer, fail])

  const start = useCallback(async () => {
    // pressing the keys always wins: whatever Astra was doing (talking, thinking, showing its answer, waiting for a
    // yes or no) is dropped, and it starts listening at once. reset() stops the voice and any work in flight.
    if (stateRef.current.phase === 'listening') return
    reset()
    handsFree.current = false
    stopping.current = false
    const id = run.current
    const pressedAt = performance.now()
    setState({ ...IDLE, phase: 'listening' })
    try {
      const s = await openMic()
      dlog(`mic opened: ${s.getAudioTracks()[0]?.label ?? 'unknown'}`)
      if (run.current !== id) return s.getTracks().forEach((t) => t.stop())
      stream.current = s
      // Whisper wants 16 kHz audio, so the recording context runs at that rate
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtx.current = ctx
      // a context made without a click may start paused, which would record silence
      await ctx.resume().catch(() => {})
      const an = ctx.createAnalyser()
      an.fftSize = 512
      const src = ctx.createMediaStreamSource(s)
      src.connect(an)
      startSpeech(ctx, src, (heard) => run.current === id && setState((st) => (st.phase === 'listening' ? { ...st, heard } : st)))
      // only now is it really recording, so this is the moment to start talking
      setState((st) => (st.phase === 'listening' && run.current === id ? { ...st, armed: true } : st))
      play('open', { emphasis: 'normal' })
      dlog(`recording after ${Math.round(performance.now() - pressedAt)}ms`)
      const buf = new Uint8Array(an.fftSize)
      const freq = new Uint8Array(an.frequencyBinCount)
      const edges = bandEdges(an.frequencyBinCount)
      const heights = new Array<number>(BANDS).fill(0)
      const t0 = performance.now()
      let spoke = false
      let quietSince = t0
      let smooth = 0
      const tick = (now: number) => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(sum / buf.length)
        // quick rise, slow fall, so the glow breathes instead of flickering
        const target = Math.min(1, rms * 5)
        smooth = target > smooth ? target : smooth * 0.88 + target * 0.12
        level.set(smooth)
        an.getByteFrequencyData(freq)
        for (let i = 0; i < BANDS; i++) {
          let peak = 0
          for (let k = edges[i]; k < edges[i + 1]; k++) peak = Math.max(peak, freq[k])
          const h = Math.min(1, (peak / 255) * 1.6)
          heights[i] = h > heights[i] ? h : heights[i] * 0.8 + h * 0.2
          bands[i].set(heights[i])
        }
        if (smooth > SPEECH_LEVEL) {
          spoke = true
          quietSince = now
        }
        // press-to-toggle ends on its own once you go quiet
        if (stateRef.current.phase === 'listening' && (talkRef.current === 'toggle' || handsFree.current)) {
          if ((spoke && now - quietSince > SILENCE_MS) || (!spoke && now - t0 > NO_SPEECH_MS)) {
            clearInterval(raf.current)
            return stop()
          }
        }
      }
      // a timer, not an animation frame, so it keeps running even when the window is not being painted
      raf.current = window.setInterval(() => tick(performance.now()), 33)
    } catch (err) {
      dlog(`start failed: ${err instanceof DOMException ? `${err.name}: ${err.message}` : String(err)}`)
      if (run.current === id) fail(micProblem(err))
    }
  }, [reset, level, bands, stop, fail, startSpeech])

  const talkRef = useRef(talk)
  talkRef.current = talk
  const startRef = useRef(start)
  startRef.current = start
  const stopRef = useRef(stop)
  stopRef.current = stop

  const lastKey = useRef({ down: false, at: 0 })
  const onKey = useCallback((down: boolean) => {
    // the same press or release can be delivered twice in a row; the copy must not count again
    const now = Date.now()
    if (lastKey.current.down === down && now - lastKey.current.at < 150) return
    lastKey.current = { down, at: now }
    const phase = stateRef.current.phase
    dlog(`key ${down ? 'down' : 'up'} phase=${phase} talk=${talkRef.current}`)
    if (talkRef.current === 'hold') {
      if (down && phase !== 'listening') {
        downAt.current = Date.now()
        void startRef.current()
      } else if (down && phase === 'listening' && handsFree.current) {
        stopRef.current()
      } else if (!down && phase === 'listening' && !handsFree.current) {
        // a tap is not a hold: keep listening, and stop when you go quiet or press again
        if (Date.now() - downAt.current < TAP_MS) handsFree.current = true
        else stopRef.current()
      }
    } else if (down) {
      if (phase === 'listening') stopRef.current()
      else void startRef.current()
    }
  }, [])

  // the real thing: a system-wide shortcut, so it works while any other app has focus
  useEffect(() => {
    if (!enabled || !hotkey || !IS_TAURI) return
    return bindKey(hotkey, (e) => onKey(e.state === 'Pressed'), true)
  }, [enabled, hotkey, onKey])

  // Esc backs out at any point; it is only grabbed globally while the assistant is awake
  const awake = state.phase !== 'idle'
  useEffect(() => {
    if (!enabled || !awake || !IS_TAURI) return
    return bindKey('Escape', (e) => {
      if (e.state === 'Pressed') cancel()
    })
  }, [enabled, awake, cancel])

  // the browser demo has no global keys, so the same shortcut works while the page is focused
  useEffect(() => {
    if (!enabled || IS_TAURI) return
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return cancel()
      if (!e.repeat && matches(e, hotkey)) {
        e.preventDefault()
        onKey(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      // letting go of any key of the combo ends a hold
      const key = hotkey.split('+').pop()?.toLowerCase()
      const k = e.key === ' ' ? 'space' : e.key.toLowerCase()
      if (k === key || ['control', 'shift', 'alt', 'meta'].includes(k)) onKey(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [enabled, hotkey, onKey, cancel])

  // turning the feature off, or leaving the page, shuts the mic
  useEffect(() => {
    if (!enabled) cancel()
  }, [enabled, cancel])
  useEffect(() => () => reset(), [reset])

  /** Settings / demo: jump straight to a phase so the look can be tried without talking. */
  const preview = useCallback(
    (phase: AssistantPhase) => {
      reset()
      if (phase === 'idle') return setState(IDLE)
      const demo: AssistantState = {
        phase,
        heard: '',
        reply: phase === 'speaking' || phase === 'done' ? PLACEHOLDER : '',
        replyLen: phase === 'speaking' || phase === 'done' ? PLACEHOLDER.length : 0,
        actions: phase === 'done' ? ['Opening Spotify'] : [],
        armed: phase === 'listening',
        confirmText: phase === 'confirm' ? 'Open the Documents folder?' : '',
        error: phase === 'error' ? "I can't reach your microphone" : '',
      }
      setState(demo)
      // keep the meter moving so the glow and mouth have something to show
      if (phase === 'listening' || phase === 'speaking') {
        const id = run.current
        const t = window.setInterval(() => {
          if (run.current !== id) return window.clearInterval(t)
          level.set(0.25 + Math.random() * 0.7)
          for (const b of bands) b.set(0.15 + Math.random() * 0.85)
        }, 90)
        timers.current.push(t)
      }
      if (phase === 'done' || phase === 'error') later(() => setState(IDLE), LINGER)
    },
    [reset, later, level, bands],
  )

  return { state, level, bands, start, stop, cancel, preview, answerConfirm, chat: { messages, busy: chatBusy, send: sendChat, clear: clearChat } }
}
