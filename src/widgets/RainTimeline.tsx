import { useEffect, useId, useRef, useState } from 'react'
import { strength, SURE, WET, type RainEvent, type Strength } from '../lib/weatherOutlook'

/**
 * The next three hours of rain on a real clock: "Now" at the left, the hours along the bottom, a bar per
 * quarter-hour. Heights sit on a fixed light / moderate / heavy scale (named down the right), so a short bar always
 * means a drizzle and never just "less than the rest". Dry quarter-hours are a dot on the line, not a faint bar.
 * A bracket over the bars marks the rain the sentence above is talking about, with its times. Hover, or focus and
 * use the arrow keys, to read any quarter-hour.
 */

const SPAN = 3 * 3600_000
const STEP = 15 * 60_000
/** px: the bracket row on top, the plot, the hour labels under it, and the band names on the right */
const TOP = 20
const PLOT = 50
const AXIS = 16
const GUTTER = 50
const HEIGHT = TOP + PLOT + AXIS
const BAR_MAX = 24

/** mm an hour -> how high a bar stands (0..1), on a fixed scale with a band for each strength */
const BANDS: { name: Strength; from: number; to: number; lo: number; hi: number }[] = [
  { name: 'light', from: WET * 4, to: 2.5, lo: 0.18, hi: 0.42 },
  { name: 'moderate', from: 2.5, to: 7.5, lo: 0.42, hi: 0.72 },
  { name: 'heavy', from: 7.5, to: 20, lo: 0.72, hi: 1 },
]
function level(mmPerHour: number) {
  const b = BANDS.find((b) => mmPerHour < b.to) ?? BANDS[2]
  const t = Math.min(1, Math.max(0, (mmPerHour - b.from) / (b.to - b.from)))
  return b.lo + t * (b.hi - b.lo)
}

const DROPS: Record<Strength, { n: number; s: number }> = { light: { n: 2, s: 1.5 }, moderate: { n: 3, s: 1.05 }, heavy: { n: 4, s: 0.75 } }

/** a column with a 4px rounded top and a square foot */
function column(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`
}

interface Props {
  /** the quarter-hours of the forecast (mm in each) */
  slots: { at: number; mm: number; chance?: number }[]
  /** the rain the sentence above describes, bracketed on the chart */
  event: RainEvent | null
  /** "14:30" in the forecast place's own time */
  clock: (ms: number) => string
  /** the place's offset from UTC, in seconds: the hour marks fall on its own full hours */
  utcOffset: number
  /** the dry window Lumi suggests going out in (see goAdvice), shaded on the chart */
  go?: { from: number | null; to: number | null } | null
  now?: number
  /** dev gallery: hold one quarter-hour as if hovered */
  pin?: number
  /** how many forecasts the rain is the consensus of: each quarter-hour says how many agree */
  sources?: number
}

export function RainTimeline({ slots, event, clock, utcOffset, go, now: nowProp, pin, sources }: Props) {
  const id = useId().replace(/:/g, '')
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(420)
  const [active, setActive] = useState<number | null>(pin ?? null)
  // the chart follows the clock: "now" moves along once a minute
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (nowProp != null) return
    const t = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [nowProp])
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const now = nowProp ?? tick
  const end = now + SPAN
  const plotW = Math.max(120, width - GUTTER)
  const x = (t: number) => ((t - now) / SPAN) * plotW
  const base = TOP + PLOT
  const y = (f: number) => base - f * PLOT

  const cols = slots
    .filter((s) => s.at + STEP > now && s.at < end)
    .map((s) => {
      const x0 = x(Math.max(s.at, now))
      const x1 = x(Math.min(s.at + STEP, end))
      const rate = s.mm * 4
      const wet = s.mm >= WET
      const bw = Math.max(2, Math.min(BAR_MAX, x1 - x0 - 2))
      const h = wet ? level(rate) * PLOT : 0
      // rain only some of the forecasts have is drawn fainter
      const maybe = wet && s.chance != null && s.chance < SURE
      return { ...s, x0, x1, cx: (x0 + x1) / 2, bw, h, wet, maybe, kind: wet ? strength(rate) : null }
    })
    .filter((c) => c.x1 - c.x0 >= 3)

  // the location's full hours inside the window
  const off = utcOffset * 1000
  const hours: number[] = []
  for (let t = Math.ceil((now + off) / 3600_000) * 3600_000 - off; t < end; t += 3600_000) {
    const tx = x(t)
    if (tx > 34 && tx < plotW - 16) hours.push(t)
  }

  // the bracket: the rain the sentence is about, as far as it falls inside the window
  let bracket: { x0: number; x1: number; capL: boolean; capR: boolean; text: string; cx: number } | null = null
  if (event) {
    const s = Math.max(event.start, now)
    const e = Math.min(event.end ?? Infinity, end)
    if (e > s) {
      const capL = event.start >= now
      const capR = event.end != null && event.end <= end
      const from = event.now ? 'Now' : clock(event.start)
      const to = event.end ? clock(event.end) : 'later'
      const text = `${from} – ${to} · ${event.strength}${event.chance < SURE ? ', possible' : ''}`
      const x0 = x(s)
      const x1 = x(e)
      const half = text.length * 2.9
      const cx = Math.min(plotW - half, Math.max(half, (x0 + x1) / 2))
      bracket = { x0, x1, capL, capR, text, cx }
    }
  }

  // the window to go out in: a wash behind the bars and a line on the ground under it
  const goBand =
    go?.from != null && go.to != null && go.to > now && go.from < end
      ? { x0: x(Math.max(go.from, now)), x1: x(Math.min(go.to, end)) }
      : null

  const cur = active != null ? cols[active] : null
  const describeCol = (c: (typeof cols)[number]) =>
    `${clock(Math.max(c.at, now))}–${clock(c.at + STEP)}: ${c.wet ? `${c.kind} rain, ${c.mm.toFixed(1)} mm` : 'dry'}`
  const summary = event
    ? `Rain over the next 3 hours: ${event.strength} rain ${event.now ? 'now' : `from ${clock(event.start)}`}${event.end ? ` until ${clock(event.end)}` : ''}.`
    : 'Rain over the next 3 hours: dry.'

  const pick = (px: number) => {
    let best: number | null = null
    let d = Infinity
    cols.forEach((c, i) => {
      const dist = px < c.x0 ? c.x0 - px : px > c.x1 ? px - c.x1 : 0
      if (dist < d) {
        d = dist
        best = i
      }
    })
    return d <= 6 ? best : null
  }

  const tipW = 150
  const tipLeft = cur ? Math.min(plotW - tipW, Math.max(0, cur.cx - tipW / 2)) : 0

  return (
    <div
      ref={wrap}
      className={`rt${cur ? ' rt-hovering' : ''}`}
      tabIndex={0}
      role="group"
      aria-label={`${summary} Use the arrow keys to read each quarter-hour.`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setActive(pick(e.clientX - r.left))
      }}
      onPointerLeave={() => setActive(null)}
      onFocus={() => setActive((a) => a ?? 0)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          e.stopPropagation()
          const dir = e.key === 'ArrowRight' ? 1 : -1
          setActive((a) => Math.min(cols.length - 1, Math.max(0, (a ?? 0) + dir)))
        } else if (e.key === 'Escape') setActive(null)
      }}
    >
      <svg width={width} height={HEIGHT} aria-hidden>
        <defs>
          {cols.map((c, i) =>
            c.wet ? (
              <clipPath key={i} id={`${id}c${i}`}>
                <path d={column(c.cx - c.bw / 2, y(c.h / PLOT), c.bw, c.h)} />
              </clipPath>
            ) : null,
          )}
        </defs>

        {goBand && goBand.x1 - goBand.x0 >= 4 && (
          <g className="rt-go">
            <rect x={goBand.x0} y={TOP} width={goBand.x1 - goBand.x0} height={PLOT} rx={3} />
            <line x1={goBand.x0 + 1} x2={goBand.x1 - 1} y1={base + 1} y2={base + 1} />
            {goBand.x1 - goBand.x0 >= 26 && (
              <text x={goBand.x0 + 5} y={TOP + 9}>
                go
              </text>
            )}
          </g>
        )}

        {/* the strength bands: hairline boundaries, named in the gutter */}
        {BANDS.map((b) => (
          <g key={b.name}>
            {b.lo > 0.2 && <line className="rt-grid" x1={0} x2={plotW} y1={y(b.lo) + 0.5} y2={y(b.lo) + 0.5} />}
            <text className={`rt-band${cur?.kind === b.name ? ' on' : ''}`} x={plotW + 8} y={y((b.lo + b.hi) / 2 - (b.name === 'light' ? 0.08 : 0))} dominantBaseline="middle">
              {b.name}
            </text>
          </g>
        ))}

        {/* the bracket over the rain the sentence talks about */}
        {bracket && (
          <g className="rt-bracket">
            <path
              d={`M${bracket.x0 + 0.5} ${bracket.capL ? 18 : 14}V14H${bracket.x1 - 0.5}${bracket.capR ? 'V18' : ''}`}
              fill="none"
            />
            {!bracket.capR && <path d={`M${bracket.x1 - 4} 11L${bracket.x1} 14L${bracket.x1 - 4} 17`} fill="none" />}
            <text x={bracket.cx} y={9} textAnchor="middle">
              {bracket.text}
            </text>
          </g>
        )}

        {/* the quarter-hours */}
        {cols.map((c, i) => {
          const on = active === i
          if (!c.wet)
            return <circle key={i} className={`rt-dry${on ? ' on' : ''}`} cx={c.cx} cy={base - 2} r={on ? 2.5 : 1.5} />
          const top = y(c.h / PLOT)
          const drops = DROPS[c.kind!]
          return (
            <g key={i} className={`rt-col rt-${c.kind}${c.maybe ? ' maybe' : ''}${on ? ' on' : ''}`} style={{ animationDelay: `${i * 28}ms` }}>
              <path d={column(c.cx - c.bw / 2, top, c.bw, c.h)} />
              <g clipPath={`url(#${id}c${i})`} className="rt-drops">
                {Array.from({ length: drops.n }, (_, k) => {
                  const dx = c.cx - c.bw / 2 + ((k + 0.5) / drops.n) * c.bw + (((i * 7 + k * 3) % 5) - 2) * 0.6
                  return (
                    <line
                      key={k}
                      x1={dx}
                      x2={dx - 1}
                      y1={top - 6}
                      y2={top - 1}
                      style={{ ['--fall' as string]: `${c.h + 8}px`, animationDuration: `${drops.s}s`, animationDelay: `${-((i * 0.37 + k * 0.53) % drops.s)}s` }}
                    />
                  )
                })}
              </g>
            </g>
          )
        })}

        {/* the ground line, now, and the hours */}
        <line className="rt-axis" x1={0} x2={plotW} y1={base + 0.5} y2={base + 0.5} />
        <circle className="rt-now-ring" cx={1} cy={base} r={3} />
        <circle className="rt-now" cx={1} cy={base} r={3} />
        <text className="rt-tick now" x={0} y={base + 12}>
          Now
        </text>
        {hours.map((t) => (
          <g key={t}>
            <line className="rt-axis" x1={x(t)} x2={x(t)} y1={base} y2={base + 3} />
            <text className="rt-tick" x={x(t)} y={base + 12} textAnchor="middle">
              {clock(t)}
            </text>
          </g>
        ))}
        {cur && <line className="rt-cross" x1={cur.cx} x2={cur.cx} y1={TOP - 2} y2={base} />}
      </svg>

      {cur && (
        <div className="rt-tip" style={{ left: tipLeft, width: tipW }}>
          <b>
            {clock(Math.max(cur.at, now))}–{clock(cur.at + STEP)}
          </b>
          <span>{cur.wet ? `${cur.kind![0].toUpperCase()}${cur.kind!.slice(1)} rain${cur.maybe ? ' possible' : ''} · ${cur.mm.toFixed(1)} mm` : 'Dry'}</span>
          {sources && sources > 1 && cur.chance != null && (
            <span>
              {Math.round(cur.chance * sources)} of {sources} forecasts have rain
            </span>
          )}
        </div>
      )}
      <span className="rt-sr" aria-live="polite">
        {cur ? describeCol(cur) : ''}
      </span>
      <table className="rt-sr">
        <caption>Rain, quarter-hour by quarter-hour</caption>
        <tbody>
          {cols.map((c, i) => (
            <tr key={i}>
              <th scope="row">{clock(Math.max(c.at, now))}</th>
              <td>{c.wet ? `${c.kind} rain, ${c.mm.toFixed(1)} mm` : 'dry'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
