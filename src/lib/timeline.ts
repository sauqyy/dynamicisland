/**
 * Course timelines: reading the documents a course keeps its schedule in (PDF, Word, PowerPoint,
 * Excel, HTML pages, Google Sheets/Docs/Slides) and turning their rows into dated sessions, each
 * with the topic it covers. Every reader returns text with one table row per line and " | "
 * between cells, which is what the timeline parser reads.
 */

// ---------- documents to text ----------

const decoder = new TextDecoder()

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** One trimmed line per row, spaces collapsed, empty lines dropped. */
function cleanLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 150_000)
}

/** Text of an HTML page, with table cells kept apart and each row, paragraph or item on its own line. */
export function htmlLines(html: string | null | undefined): string {
  if (!html) return ''
  const marked = html
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<br\s*\/?>|<\/(tr|p|div|li|h[1-6]|table)>/gi, '\n')
  const doc = new DOMParser().parseFromString(marked, 'text/html')
  return cleanLines(doc.body.textContent ?? '')
}

/** CSV (as Google Sheets exports it) with quoted fields. */
function csvLines(text: string): string {
  const rows: string[] = []
  let cell = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch === '\n' ? ' ' : ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row.join(' | '))
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  rows.push(row.join(' | '))
  return cleanLines(rows.join('\n'))
}

/** Entries of a zip (Office files are zips) whose names pass `want`, inflated with the browser's own deflate. */
async function unzip(bytes: Uint8Array, want: (name: string) => boolean): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // the central directory at the end lists each entry with its local header's offset
  let eocd = bytes.length - 22
  while (eocd > 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--
  if (eocd <= 0) return out
  let p = v.getUint32(eocd + 16, true)
  const entries = v.getUint16(eocd + 10, true)
  for (let i = 0; i < entries && p + 46 <= bytes.length; i++) {
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extra = v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extra
    if (!want(name) || (method !== 0 && method !== 8)) continue
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const raw = bytes.slice(start, start + size)
    out.set(
      name,
      method === 0 ? decoder.decode(raw) : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(),
    )
  }
  return out
}

/** Word or PowerPoint XML: table cells joined by " | ", rows and paragraphs on their own lines. */
function officeLines(xml: string, ns: 'w' | 'a'): string {
  const cell = new RegExp(`<${ns}:tc[ >][\\s\\S]*?</${ns}:tc>`, 'g')
  const text = xml
    .replace(cell, (c) => c.replace(new RegExp(`</${ns}:p>`, 'g'), ' ').replace(/<[^>]+>/g, '') + ' | ')
    .replace(new RegExp(`</${ns}:tr>`, 'g'), '\n')
    .replace(new RegExp(`</${ns}:p>`, 'g'), '\n')
    .replace(new RegExp(`<${ns}:(tab|br)\\s*/>`, 'g'), ' ')
    .replace(/<[^>]+>/g, '')
  return decodeXml(text)
}

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** An Excel date serial (days since 1899-12-30) as "24 Aug 2026", so the parser reads it as a date. */
function excelDate(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000)
  return `${d.getUTCDate()} ${MONTH_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

async function xlsxLines(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )
  const col = (ref: string) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  const sheets = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const lines: string[] = []
  for (const name of sheets.slice(0, 6)) {
    for (const row of files.get(name)!.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: [number, string][] = []
      for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[2]
        const body = c[3] ?? ''
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let text = ''
        if (/t="s"/.test(attrs) && v !== undefined) text = shared[Number(v)] ?? ''
        else if (/t="inlineStr"/.test(attrs)) text = decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
        else if (v !== undefined) {
          const n = Number(v)
          // whole numbers in this range are almost always dates in a timeline sheet
          text = /t="(str|b|e)"/.test(attrs) ? decodeXml(v) : n > 40_000 && n < 60_000 ? excelDate(n) : v
        }
        if (text.trim()) cells.push([col(c[1]), text])
      }
      if (cells.length) lines.push(cells.sort((a, b) => a[0] - b[0]).map((c) => c[1]).join(' | '))
    }
  }
  return cleanLines(lines.join('\n'))
}

async function pptxLines(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  return cleanLines(
    [...files.entries()]
      .sort((a, b) => Number(a[0].match(/(\d+)\.xml$/)![1]) - Number(b[0].match(/(\d+)\.xml$/)![1]))
      .map(([, xml]) => officeLines(xml, 'a'))
      .join('\n'),
  )
}

async function docxLines(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes, (n) => n === 'word/document.xml')
  return cleanLines(officeLines(files.get('word/document.xml') ?? '', 'w'))
}

/** pdf.js's worker, started on the first PDF and kept for the rest. */
let pdfWorker: Worker | null = null

/**
 * PDF text rebuilt into rows: pdf.js gives each run of text with its position, so runs on the same
 * line are put together in reading order, with " | " where a wide gap separates table columns.
 */
async function pdfLines(bytes: Uint8Array): Promise<string> {
  // loaded only when a PDF is read, so the island itself stays light
  const pdfjs = await import('pdfjs-dist')
  // Vite bundles a worker written this way as a plain .js file, which the app's asset server
  // serves as JavaScript (a bare .mjs URL may not be)
  pdfWorker ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
  pdfjs.GlobalWorkerOptions.workerPort = pdfWorker
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const out: string[] = []
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
      const content = await (await doc.getPage(n)).getTextContent()
      const runs = content.items
        .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it && it.str.trim() !== '')
        .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10 }))
        .sort((a, b) => b.y - a.y || a.x - b.x)
      const lines: (typeof runs)[] = []
      for (const r of runs) {
        const line = lines.at(-1)
        if (line && Math.abs(line[0].y - r.y) <= Math.max(2, r.h * 0.45)) line.push(r)
        else lines.push([r])
      }
      for (const line of lines) {
        line.sort((a, b) => a.x - b.x)
        let text = ''
        let end = -Infinity
        for (const r of line) {
          const gap = r.x - end
          text += end === -Infinity ? '' : gap > r.h * 1.2 ? ' | ' : gap > r.h * 0.15 ? ' ' : ''
          text += r.s
          end = r.x + r.w
        }
        out.push(text)
      }
    }
  } finally {
    await doc.destroy()
  }
  return cleanLines(out.join('\n'))
}

/** Text of a document, picked by its file name or media type. Old binary .doc/.ppt/.xls are not read. */
export async function documentLines(bytes: Uint8Array, name: string, mime = ''): Promise<string> {
  const is = (ext: RegExp, type: RegExp) => ext.test(name) || type.test(mime)
  if (is(/\.pdf$/i, /pdf/)) return pdfLines(bytes)
  if (is(/\.docx$/i, /wordprocessingml/)) return docxLines(bytes)
  if (is(/\.pptx$/i, /presentationml/)) return pptxLines(bytes)
  if (is(/\.xlsx$/i, /spreadsheetml/)) return xlsxLines(bytes)
  if (is(/\.csv$/i, /text\/csv/)) return csvLines(decoder.decode(bytes))
  if (is(/\.html?$/i, /text\/html/)) return htmlLines(decoder.decode(bytes))
  if (is(/\.(txt|md)$/i, /text\/plain/)) return cleanLines(decoder.decode(bytes))
  return ''
}

/** File kinds the readers above understand. */
export const READABLE = /\.(pdf|docx|pptx|xlsx|csv|html?|txt|md)$/i

// ---------- timelines ----------

/** One dated entry of a course timeline. */
export interface Session {
  /** local midnight of the day, ms */
  date: number
  /** for an entry that covers a span ("24 - 28 Aug"): the day after it ends */
  until?: number
  topic: string
  week?: number
  /** a class meeting, an exam (UTS/UAS) or a day without class (holiday, break) */
  kind: 'class' | 'exam' | 'off'
  /** "10:00", when the row gives a time */
  start?: string
  end?: string
}

/** What a timeline document says: its dated sessions, and topics by week number when it has no dates. */
export interface Timeline {
  sessions: Session[]
  weeks: Record<number, string>
}

const MON =
  '(jan(?:uari|uary)?|feb(?:ruari|ruary)?|mar(?:et|ch)?|apr(?:il)?|mei|may|jun[ei]?|jul[iy]?|agu(?:stus)?|agt|aug(?:ust)?|sept?(?:ember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)\\.?'
const MONTH_INDEX: [RegExp, number][] = [
  [/^jan/, 0], [/^feb/, 1], [/^mar/, 2], [/^apr/, 3], [/^(mei|may)/, 4], [/^jun/, 5],
  [/^jul/, 6], [/^(agu|agt|aug)/, 7], [/^sep/, 8], [/^(okt|oct)/, 9], [/^nov/, 10], [/^(des|dec)/, 11],
]
const monthOf = (w: string) => MONTH_INDEX.find(([re]) => re.test(w.toLowerCase()))?.[1] ?? -1
const TO = String.raw`\s*(?:-|–|—|s\.?\s?d\.?|to|until|sampai|hingga)\s*`
const TIME = /(\d{1,2})[.:](\d{2})\s*(?:-|–|—|s\.?\s?d\.?|sampai|to)\s*(\d{1,2})[.:](\d{2})/
const WEEK = /\b(?:week|minggu|pekan|pertemuan|sesi|session|meeting|wk|w)\s*(?:ke\s*-?\s*)?(\d{1,2})\b/i
// "minggu" is Sunday only before a comma or a date: "minggu tenang" is reading week
const DAY_ABBR = /\b(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu(?=\s*,|\s+\d)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|sen|sel|rab|kam|jum|sab)\b\.?,?/gi
const EXAM = /\b(uts|uas|ujian|midterm|mid-term|mid term|final exam|final test|final examination|exam|ujian akhir|ujian tengah)\b/i
const OFF = /\b(libur|holiday|no class|no classes|no lecture|tidak ada kuliah|tidak ada kelas|cuti bersama|break|reading week|minggu tenang|dies natalis|day off)\b/i
const HEADER = /^(no\.?|#|topic|topics|topik|materi|material|materials|subject|date|dates|tanggal|week|weeks|minggu|minggu ke|pekan|pertemuan|pertemuan ke|day|hari|notes?|keterangan|catatan|lecturer|dosen|pengajar|activity|activities|kegiatan|session|sesi|time|waktu|jam|room|ruang|description|deskripsi|agenda|content|bahasan|pokok bahasan|sub topic|reading|readings|reference|referensi|assignment|assignments|tugas)$/i

/** The days a timeline can be about: the course's term, so revision dates and references are left out. */
export type Window = [from: number, to: number]

const dayStart = (y: number, m: number, d: number) => {
  const t = new Date(y, m, d)
  return t.getMonth() === m && t.getDate() === d ? t.getTime() : NaN
}

/** A date in the window: with its year if written, else the year that puts it inside the window. */
function resolve(day: number, mon: number, year: string | undefined, win: Window): number {
  if (mon < 0 || day < 1 || day > 31) return NaN
  const years = year ? [year.length === 2 ? 2000 + Number(year) : Number(year)] : [new Date(win[0]).getFullYear(), new Date(win[0]).getFullYear() + 1]
  for (const y of years) {
    const t = dayStart(y, mon, day)
    if (t >= win[0] && t <= win[1]) return t
  }
  return NaN
}

/** The dates written in one line: single days, and spans covering several days. */
function datesIn(line: string, win: Window) {
  const singles: number[] = []
  const spans: [number, number][] = []
  let rest = line
  // a date was written, even one outside the term (a revision date): the line is not a topic's continuation
  let any = false
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    rest = rest.replace(re, (...args) => {
      any = true
      fn(args.slice(0, -2) as unknown as RegExpExecArray)
      return ' ⟦⟧ '
    })
  }
  // "24 Aug - 4 Sep 2026", "24 - 28 Aug 2026", "Aug 24 - 28, 2026"
  take(new RegExp(String.raw`\b(\d{1,2})\s+${MON}${TO}(\d{1,2})\s+${MON}(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => {
    const a = resolve(+m[1], monthOf(m[2]), m[5], win)
    const b = resolve(+m[3], monthOf(m[4]), m[5], win)
    if (a && b && b >= a) spans.push([a, b])
  })
  take(new RegExp(String.raw`\b(\d{1,2})${TO}(\d{1,2})\s+${MON}(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => {
    const a = resolve(+m[1], monthOf(m[3]), m[4], win)
    const b = resolve(+m[2], monthOf(m[3]), m[4], win)
    if (a && b && b >= a) spans.push([a, b])
  })
  take(new RegExp(String.raw`\b${MON}\s+(\d{1,2})${TO}(\d{1,2})(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => {
    const a = resolve(+m[2], monthOf(m[1]), m[4], win)
    const b = resolve(+m[3], monthOf(m[1]), m[4], win)
    if (a && b && b >= a) spans.push([a, b])
  })
  // "24 Aug 2026", "Senin, 24 Agustus", "Aug 24, 2026", "24/08/2026", "2026-08-24"
  take(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MON}(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => singles.push(resolve(+m[1], monthOf(m[2]), m[3], win)))
  take(new RegExp(String.raw`\b${MON}\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => singles.push(resolve(+m[2], monthOf(m[1]), m[3], win)))
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => singles.push(resolve(+m[3], +m[2] - 1, m[1], win)))
  take(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m) => singles.push(resolve(+m[1], +m[2] - 1, m[3], win)))
  return { singles: singles.filter((t) => !Number.isNaN(t)), spans: spans.filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b)), rest, any }
}

/** What a row is about: its text without dates, times, days, week numbers and column headings. */
function topicOf(rest: string): string {
  return rest
    .replace(new RegExp(TIME.source, 'gi'), ' ')
    .replace(DAY_ABBR, ' ')
    .replace(new RegExp(WEEK.source, 'gi'), ' ')
    .replace(/⟦⟧/g, ' ')
    .replace(/\bWIB\b/gi, ' ')
    .split('|')
    .map((c) => c.replace(/^[\s\d.,:;()\-–—#]+|[\s,:;(\-–—]+$/g, '').trim())
    .filter((c) => /\p{L}{3,}/u.test(c) && !HEADER.test(c))
    .join(' · ')
    .slice(0, 160)
}

const kindOf = (text: string): Session['kind'] => (OFF.test(text) ? 'off' : EXAM.test(text) ? 'exam' : 'class')

/**
 * Reads a timeline out of a document's rows. A row with a date is a session, with what the rest of
 * the row says as its topic; a row that goes on without a date (a table cell wrapping in a PDF)
 * adds to the session above. Rows with only a week number give topics by week. Not a timeline
 * (null) unless at least three sessions or five weeks are found.
 */
export function parseTimeline(text: string, win: Window): Timeline | null {
  const byDate = new Map<string, Session>()
  const weeks: Record<number, string> = {}
  let last: Session | null = null
  let carried = 0
  for (const line of text.split('\n')) {
    const time = line.match(TIME)
    const week = line.match(WEEK)
    const { singles, spans, rest, any } = datesIn(line.replace(new RegExp(TIME.source, 'g'), ' '), win)
    const topic = topicOf(rest)
    const kind = kindOf(line)
    const base = {
      topic,
      kind,
      week: week ? Number(week[1]) : undefined,
      ...(time ? { start: `${time[1].padStart(2, '0')}:${time[2]}`, end: `${time[3].padStart(2, '0')}:${time[4]}` } : {}),
    }
    const found: Session[] = singles.length ? singles.map((date) => ({ date, ...base })) : spans.map(([a, b]) => ({ date: a, until: b + 86_400_000, ...base }))
    if (found.length) {
      for (const s of found) {
        const key = `${s.date}-${s.until ?? ''}`
        const had = byDate.get(key)
        // two rows on one day (e.g. lecture and lab) share it
        if (had) had.topic = [had.topic, s.topic].filter(Boolean).join(' · ').slice(0, 200)
        else byDate.set(key, s)
      }
      last = found[found.length - 1]
      carried = 0
    } else if (week && topic) {
      weeks[Number(week[1])] = topic
      last = null
    } else if (last && topic && !any && carried < 2 && last.topic.length < 110) {
      last.topic = [last.topic, topic].filter(Boolean).join(' · ').slice(0, 200)
      if (kindOf(topic) !== 'class') last.kind = kindOf(topic)
      carried++
    } else last = null
  }
  const sessions = [...byDate.values()].sort((a, b) => a.date - b.date)
  const dated = sessions.filter((s) => !s.until && s.kind === 'class').length
  if (dated < 3 && sessions.length < 4 && Object.keys(weeks).length < 5) return null
  return { sessions, weeks }
}

/** How much a timeline has to say: dated sessions count most. */
export const timelineScore = (t: Timeline) => t.sessions.filter((s) => s.kind === 'class').length * 3 + Object.keys(t.weeks).length

/**
 * The weekly class days a timeline shows: the weekdays its class sessions fall on (a day counts
 * when it holds at least a quarter of them, so one make-up class doesn't add a day), with the time
 * most of that day's rows give.
 */
export function classDays(t: Timeline): { day: number; start?: string; end?: string }[] {
  const dated = t.sessions.filter((s) => !s.until && s.kind === 'class')
  if (dated.length < 3) return []
  const count = new Map<number, Session[]>()
  for (const s of dated) {
    const d = new Date(s.date).getDay()
    count.set(d, [...(count.get(d) ?? []), s])
  }
  const need = Math.max(2, Math.ceil(dated.length * 0.25))
  return [...count.entries()]
    .filter(([, list]) => list.length >= need)
    .map(([day, list]) => {
      const timed = list.filter((s) => s.start)
      const mode = timed.length
        ? [...timed.reduce((m, s) => m.set(`${s.start}-${s.end}`, (m.get(`${s.start}-${s.end}`) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0][0]
        : ''
      const [start, end] = mode ? mode.split('-') : [undefined, undefined]
      return { day, start, end }
    })
    .sort((a, b) => a.day - b.day)
}

/** What the timeline says about one day: its own session, else the span or week it falls in. */
export interface Agenda {
  topic: string
  kind: Session['kind']
  /** exactly that day, or only the week (a span or a week number) */
  exact: boolean
  week?: number
}

const WEEK_MS = 7 * 86_400_000
const mondayOf = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}

export function agendaOn(t: Timeline, date: number, courseStart: number): Agenda | null {
  const day = new Date(new Date(date).getFullYear(), new Date(date).getMonth(), new Date(date).getDate()).getTime()
  const exact = t.sessions.filter((s) => !s.until && s.date === day)
  if (exact.length) {
    const kind = exact.some((s) => s.kind === 'off') ? 'off' : exact.some((s) => s.kind === 'exam') ? 'exam' : 'class'
    return { topic: exact.map((s) => s.topic).filter(Boolean).join(' · '), kind, exact: true, week: exact[0].week }
  }
  const span = t.sessions.find((s) => s.until && day >= s.date && day < s.until)
  if (span) return { topic: span.topic, kind: span.kind, exact: false, week: span.week }
  // a timeline by week number only: count weeks from the first session, or the course start
  const first = t.sessions[0]?.date ?? courseStart
  if (first && Object.keys(t.weeks).length) {
    const n = Math.floor((mondayOf(day) - mondayOf(first)) / WEEK_MS) + 1
    if (t.weeks[n]) return { topic: t.weeks[n], kind: kindOf(t.weeks[n]), exact: false, week: n }
  }
  return null
}

/** The timeline has dates and they have run out: the term's classes are over. */
export function timelineOver(t: Timeline, date: number): boolean {
  const lastDay = t.sessions.reduce((m, s) => Math.max(m, s.until ?? s.date + 86_400_000), 0)
  return lastDay > 0 && date > lastDay + 3 * 86_400_000
}

const STOP = new Set(
  'the and for with from into this that week minggu pekan pertemuan dan yang untuk dengan pada dari dalam atau serta oleh materi topic topik introduction pengantar lecture kuliah class kelas session sesi part bagian chapter bab'.split(' '),
)
const words = (s: string) => new Set((s.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !STOP.has(w)))

/** How many meaningful words two texts share, for matching a session's topic to course materials. */
export function overlap(a: string, b: string): number {
  const wa = words(a)
  let n = 0
  for (const w of words(b)) if (wa.has(w)) n++
  return n
}
