import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EYE_ACTS, EYE_LABELS } from '../MascotEyes'
import { LumiFace } from './LumiFace'
import { LumiCard, lumiShape } from './LumiCard'
import { LumiIntro } from './LumiIntro'
import { MOODS, MOOD_IDS, type LumiMood } from './moods'
import { say, type Say } from './moments'
import { LumiCalmContext } from './calm'
import { configureLumiSound } from './lumiSfx'
import { STUDIES, Silhouette } from './LumiSilhouettes'

/** the theme variables the island's own CSS reads, so the cards look here as they do in the app */
const THEME = {
  ['--text-1' as string]: '#f2f2f7',
  ['--text-2' as string]: '#a1a1b3',
  ['--fg-rgb' as string]: '255 255 255',
  ['--fs-body' as string]: '13.5px',
  ['--fs-meta' as string]: '12px',
  ['--island-bg' as string]: '#000',
  ['--accent' as string]: '#8ab4ff',
}

interface Beat {
  at: string
  mood: LumiMood
  ask?: boolean
  ms: number
  note: string
}

/** A student's day, as Lumi would live it. */
const DAY: Beat[] = [
  { at: '07:40', mood: 'goodMorning', ms: 4800, note: 'First time she sees you today' },
  { at: '08:55', mood: 'class1h', ms: 4200, note: 'An hour before class' },
  { at: '09:50', mood: 'class10m', ms: 4200, note: 'Ten minutes to go' },
  { at: '12:10', mood: 'hydrate', ms: 4000, note: 'After a long stretch at the computer' },
  { at: '13:30', mood: 'due6h', ms: 4200, note: 'A deadline is closing in' },
  { at: '17:00', mood: 'due1h', ms: 4200, note: 'One hour left' },
  { at: '17:34', mood: 'submitted', ms: 5600, note: 'You submitted it' },
  { at: '18:20', mood: 'graded', ms: 4600, note: 'A grade arrives (never the score on show)' },
  { at: '20:30', mood: 'examDone', ms: 6600, ask: true, note: 'Right after an exam, she asks how it went' },
  { at: '21:10', mood: 'allTodosDone', ms: 5600, note: 'The last to-do is ticked' },
  { at: '23:50', mood: 'lateNight', ms: 5200, note: 'A word about sleep' },
]

/** the moment she says, picked once per play so it does not change under your eyes */
const lineOf = (mood: LumiMood): Say => say(mood, 'Zhillan')

function Black({ w, h, children, style }: { w: number; h: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ width: w, height: h, borderRadius: Math.min(28, h / 2), background: '#000', boxShadow: '0 0 0 1px #262633, 0 14px 40px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative', ...THEME, color: '#f2f2f7', ...style }}>{children}</div>
  )
}

/** One island that shrinks to a resting pill with Lumi's eyes, opens for each moment of the day, and goes back. */
function LiveIsland({ beat, caption }: { beat: Beat | null; caption: string }) {
  const [line, setLine] = useState<Say>({ title: '' })
  useEffect(() => {
    if (beat) setLine(lineOf(beat.mood))
  }, [beat])
  const asks = beat?.ask ? 2 : 0
  const shape = beat ? lumiShape(asks, beat.mood) : { w: 140, h: 34, r: 14 }
  return (
    <div style={{ display: 'grid', placeItems: 'start center', height: 150 }}>
      <motion.div
        animate={{ width: shape.w, height: shape.h, borderBottomLeftRadius: shape.r, borderBottomRightRadius: shape.r }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{ position: 'relative', background: '#000', overflow: 'hidden', boxShadow: '0 0 0 1px #262633, 0 20px 50px rgba(0,0,0,0.6)', borderRadius: '0 0 14px 14px', ...THEME, color: '#f2f2f7' }}
        title={caption}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={beat ? beat.at : 'rest'} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }} initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.1, duration: 0.2 } }} exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.08 } }}>
            {beat ? (
              <LumiCard
                mood={beat.mood}
                title={line.title}
                sub={beat.ask ? 'Algoritma. How did it go?' : line.sub}
                ms={beat.ms}
                actions={beat.ask ? [{ label: 'It went well', primary: true, run: () => {} }, { label: 'A tough one', run: () => {} }] : undefined}
              />
            ) : (
              <LumiFace mood="idle" height={30} roam={26} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/** Mounts what it holds only while it is on screen (or about to be), and leaves a same-sized space otherwise. */
function Lazy({ h, children }: { h: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ minHeight: h }}>
      {on ? children : null}
    </div>
  )
}

function Tile({ mood }: { mood: LumiMood }) {
  const [n, setN] = useState(0)
  const line = useMemo(() => lineOf(mood), [mood, n]) // eslint-disable-line react-hooks/exhaustive-deps
  const actions = mood === 'examDone' || mood === 'confirm' ? [{ label: mood === 'confirm' ? 'Yes, remove it' : 'It went well', primary: true, run: () => {} }, { label: mood === 'confirm' ? 'Keep it' : 'A tough one', run: () => {} }] : undefined
  const sh = lumiShape(actions?.length ?? 0, mood)
  // the things she does while resting are shown as the resting pill, since that is where they happen
  const pill = MOODS[mood].group === 'Resting stories'
  const sheet = MOODS[mood].group === 'Expression sheet'
  return (
    <div onClick={() => setN((v) => v + 1)} style={{ cursor: 'pointer' }} title="Click to play it again">
      <div style={{ background: 'linear-gradient(180deg,#14141d,#0e0e15)', border: '1px solid #23232f', borderRadius: 20, padding: '14px 12px 12px' }}>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          {sheet ? (
            <Black w={150} h={140} style={{ borderRadius: 30, display: 'grid', placeItems: 'center' }}>
              <LumiFace key={n} mood={mood} height={122} body sound={n > 0} roam={10} />
            </Black>
          ) : pill ? (
            <Black w={150} h={46} style={{ borderRadius: '0 0 16px 16px', display: 'grid', placeItems: 'center' }}>
              <LumiFace key={n} mood={mood} height={34} sound={n > 0} />
            </Black>
          ) : (
            <Black w={sh.w} h={sh.h} style={{ borderRadius: sh.r, maxWidth: '100%' }}>
              <LumiCard key={n} mood={mood} title={line.title} sub={line.sub} actions={actions} sound={n > 0} />
            </Black>
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 650, color: '#e9e9f2' }}>{mood}</div>
        <div style={{ fontSize: 12, color: '#8b8ba0' }}>{MOODS[mood].label}</div>
      </div>
    </div>
  )
}

/** Dev-only page (open /?lumi): Lumi in every mood and moment, for reviewing the character. */
export function LumiShowcase() {
  const [step, setStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [intro, setIntro] = useState(false)
  const [calm, setCalm] = useState(false)
  const [sound, setSound] = useState(true)
  useEffect(() => {
    configureLumiSound({ on: sound, volume: 1, calm })
  }, [sound, calm])
  const timer = useRef(0)
  const beat = step >= 0 && step < DAY.length ? DAY[step] : null

  // play the day: each moment, a rest between, then round again
  useEffect(() => {
    if (!playing) return
    const go = (i: number) => {
      setStep(i)
      const b = DAY[i]
      // she shows it for its time, rests (resting pill), then the next one
      timer.current = window.setTimeout(() => {
        setStep(-1)
        timer.current = window.setTimeout(() => go((i + 1) % DAY.length), 2200)
      }, b.ms + 600)
    }
    go(0)
    return () => window.clearTimeout(timer.current)
  }, [playing])

  const groups = useMemo(() => {
    const g = new Map<string, LumiMood[]>()
    for (const id of MOOD_IDS) {
      const k = MOODS[id].group
      g.set(k, [...(g.get(k) ?? []), id])
    }
    // the expression sheet comes first
    return [...g.entries()].sort((a, c) => Number(c[0] === 'Expression sheet') - Number(a[0] === 'Expression sheet'))
  }, [])

  const sec = { fontSize: 15, margin: '34px 0 6px', fontWeight: 650 } as const
  const lede = { margin: '0 0 14px', color: '#8b8ba0', maxWidth: 760, lineHeight: 1.5 } as const
  return (
    <LumiCalmContext.Provider value={calm}>
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: 'radial-gradient(1200px 500px at 50% -120px, #1b2140, #0b0b10 70%)', color: '#e9e9f2', font: '14px system-ui, sans-serif', padding: '34px 24px 70px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <Black w={190} h={104} style={{ borderRadius: 28, display: 'grid', placeItems: 'center' }}>
            <LumiFace mood="idle" height={64} />
          </Black>
          <Black w={190} h={104} style={{ borderRadius: 28, display: 'grid', placeItems: 'center' }}>
            <LumiFace mood="idle" height={96} body roam={34} />
          </Black>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>Lumi</h1>
            <p style={{ margin: '4px 0 0', color: '#a1a1b3', maxWidth: 560, lineHeight: 1.5 }}>
              The Universitas Indonesia island's mascot. In the resting pill she is just two sparkle eyes, where the clock used to be; in cards and hellos she has a glass body, cheeks and a mouth. The eyes become a check mark, a star, a heart, an alarm or a coffee when something happens. Move the pointer near her and she looks at you; stay a while and she melts.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
          <button onClick={() => setSound((v) => !v)} style={chip(sound)}>
            Sound {sound ? 'on' : 'off'}
          </button>
          <button onClick={() => setCalm((v) => !v)} style={chip(calm)}>
            Calm mode {calm ? 'on' : 'off'}
          </button>
          <span style={{ color: '#8b8ba0', fontSize: 12 }}>Sounds play when you press a card or the day. Calm mode takes out the explosions, shaking and flashes, and quietens the sounds.</span>
        </div>

        <h2 style={sec}>Silhouette studies</h2>
        <p style={lede}>
          She is going to be the app icon, so her outline has to work at 16 pixels. Each study is shown in colour, as an icon at three sizes, and as a flat silhouette, which is the honest test. My pick is the first one with a badge.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
          {STUDIES.map((s) => (
            <div key={s.kind} style={{ background: 'linear-gradient(180deg,#14141d,#0e0e15)', border: s.pick === 'My pick' ? '1px solid #ffd34e' : '1px solid #23232f', borderRadius: 20, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Silhouette kind={s.kind} size={104} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    {[64, 32, 16].map((px) => (
                      <div key={px} style={{ width: px * 1.25, height: px * 1.25, borderRadius: px * 0.28, background: 'linear-gradient(160deg,#242857,#0c0d1a)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 1px #2a2c44' }}>
                        <Silhouette kind={s.kind} size={px} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ background: '#f4f4f8', borderRadius: 8, padding: 6 }}>
                      <div style={{ filter: 'invert(1)' }}>
                        <Silhouette kind={s.kind} size={34} mono />
                      </div>
                    </div>
                    <div style={{ background: '#000', borderRadius: 8, padding: 6, boxShadow: '0 0 0 1px #2a2c44' }}>
                      <Silhouette kind={s.kind} size={34} mono />
                    </div>
                    <span style={{ color: '#8b8ba0', fontSize: 11 }}>silhouette</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontWeight: 650 }}>
                {s.name} {s.pick && <span style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 99, background: s.pick === 'My pick' ? '#ffd34e' : '#2a2c44', color: s.pick === 'My pick' ? '#0b0b12' : '#c9c9d6', fontSize: 11, fontWeight: 700 }}>{s.pick}</span>}
              </div>
              <div style={{ color: '#a1a1b3', fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>{s.note}</div>
            </div>
          ))}
        </div>

        <h2 style={sec}>A day with Lumi</h2>
        <p style={lede}>The island is a resting pill with her eyes. Each moment opens it, she says it, and it settles back. Hover the island to hold a moment open, as in the app.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <button onClick={() => { setPlaying((p) => !p); if (playing) setStep(-1) }} style={btn(playing)}>
            {playing ? 'Stop' : 'Play the day'}
          </button>
          <button onClick={() => setIntro(true)} style={btn(false)}>
            Her first hello
          </button>
          <span style={{ color: '#8b8ba0' }}>{beat ? `${beat.at} · ${beat.note}` : playing ? 'Resting…' : 'Press play'}</span>
        </div>
        <LiveIsland beat={beat} caption={beat?.note ?? ''} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
          {DAY.map((b, i) => (
            <button key={b.at} onClick={() => { setPlaying(false); window.clearTimeout(timer.current); setStep(i) }} style={chip(step === i)}>
              {b.at} {MOODS[b.mood].label.split(':')[0]}
            </button>
          ))}
        </div>

        {groups.map(([name, ids]) => (
          <section key={name}>
            <h2 style={sec}>{name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
              {ids.map((id) => (
                <Lazy key={id} h={190}>
                  <Tile mood={id} />
                </Lazy>
              ))}
            </div>
          </section>
        ))}

        <h2 style={sec}>Resting: {EYE_ACTS.length} small things she does when nothing is happening</h2>
        <p style={lede}>Every few seconds, never the same twice in a row. These loop here so they can be watched; in the app they come at random.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {EYE_ACTS.map((a, i) => (
            <div key={a} style={{ background: '#101017', border: '1px solid #23232f', borderRadius: 16, padding: 10, textAlign: 'center' }}>
              <Lazy h={44}>
                <Black w={140} h={44} style={{ margin: '0 auto', borderRadius: '0 0 16px 16px', display: 'grid', placeItems: 'center' }}>
                  <LumiFace mood="idle" height={30} force={a} follow={false} />
                </Black>
              </Lazy>
              <div style={{ fontSize: 12.5, fontWeight: 650, marginTop: 8 }}>
                {i + 1}. {a}
              </div>
              <div style={{ fontSize: 11.5, color: '#8b8ba0' }}>{EYE_LABELS[a]}</div>
            </div>
          ))}
        </div>
      </div>

      {intro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setIntro(false)}>
          <div style={{ position: 'relative', width: 560, height: 420, borderRadius: 32, background: '#000', overflow: 'hidden', ...THEME, color: '#f2f2f7', boxShadow: '0 0 0 1px #262633, 0 30px 80px rgba(0,0,0,0.7)' }} onClick={(e) => e.stopPropagation()}>
            <LumiIntro suggest="Zhillan" onDone={() => setIntro(false)} />
          </div>
        </div>
      )}
    </div>
    </LumiCalmContext.Provider>
  )
}

const btn = (on: boolean): React.CSSProperties => ({ padding: '8px 18px', borderRadius: 99, border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 650, background: on ? '#ff6b6b' : '#8ab4ff', color: '#0b0b12' })
const chip = (on: boolean): React.CSSProperties => ({ padding: '4px 10px', borderRadius: 99, border: '1px solid #2a2a38', cursor: 'pointer', font: 'inherit', fontSize: 12, background: on ? '#8ab4ff' : '#14141d', color: on ? '#0b0b12' : '#c9c9d6' })
