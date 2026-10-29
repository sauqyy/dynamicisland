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

/** Marks where a PDF page starts in the text, so a session can say which page it is on. */
const PAGE_MARK = /^⟦p(\d+)⟧$/
/** Something that looks like a date, for telling table rows apart before the term is known. */
const DATE_HINT = new RegExp(
  String.raw`\b\d{1,2}(?:st|nd|rd|th)?[\s/.-]+(?:jan|feb|mar|apr|mei|may|jun|jul|agu|agt|aug|sep|okt|oct|nov|des|dec)|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b`,
  'i',
)

interface PdfCell {
  text: string
  x0: number
  x1: number
}
interface PdfLine {
  y: number
  h: number
  cells: PdfCell[]
}

/**
 * One table row from the lines it wraps over: each cell's text joined top to bottom with the cells
 * above and below it in the same column, so "Measurement scales: nominal," on one line and
 * "ordinal, interval, ratio" on the next stay one topic instead of joining the neighbouring column.
 */
function mergeColumns(lines: PdfLine[]): string {
  const cols: PdfCell[] = []
  for (const line of lines) {
    for (const c of line.cells) {
      const slack = line.h * 1.5
      const col = cols.find((k) => c.x0 < k.x1 && c.x1 > k.x0) ?? cols.find((k) => Math.abs(c.x0 - k.x0) < slack)
      if (col) {
        col.text += ' ' + c.text
        col.x0 = Math.min(col.x0, c.x0)
        col.x1 = Math.max(col.x1, c.x1)
      } else cols.push({ ...c })
    }
  }
  return cols
    .sort((a, b) => a.x0 - b.x0)
    .map((c) => c.text)
    .join(' | ')
}

/**
 * A group of lines holding several dates: table rows set without padding between them, so their
 * gaps don't show where one row ends. The layout does. When each date line also starts every other
 * column (dates at the top of their rows), a row runs from its date to the next. When the dates sit
 * apart from the grid or in the middle of their rows (centred), a row has as many lines below its
 * date as above it. Column headings above the first row are a row of their own.
 */
function splitAtDates(group: PdfLine[], dated: boolean[]): PdfLine[][] {
  const anchors = dated.flatMap((d, i) => (d ? [i] : []))
  const gap = (i: number) => group[i - 1].y - group[i].y
  const wraps = group
    .slice(1)
    .map((_, i) => gap(i + 1))
    .filter((g, i) => g >= group[i + 1].h * 0.8)
  const wrap = wraps.length ? Math.min(...wraps) : group[0].h * 1.2
  const close = (i: number) => gap(i) <= wrap * 1.25 + 0.5
  // a date line half a line from its neighbours: centred in a row with an even number of lines
  const offGrid = (a: number) => (a > 0 && gap(a) < wrap * 0.75) || (a + 1 < group.length && gap(a + 1) < wrap * 0.75)
  const widest = Math.max(...group.map((l) => l.cells.length))
  const top = anchors.every((a) => !offGrid(a)) && anchors.filter((a) => group[a].cells.length >= widest - 1).length >= anchors.length * 0.6
  const heading = (l: PdfLine) => l.cells.length > 1 && l.cells.filter((c) => isHeader(c.text)).length >= l.cells.length * 0.6

  // the first row's top: the lines just above its date, up to a gap or a line of headings
  let from = anchors[0]
  if (!top) while (from > 0 && close(from) && !heading(group[from - 1])) from--
  const rows: PdfLine[][] = group.slice(0, from).map((l) => [l])
  for (const [k, a] of anchors.entries()) {
    const next = anchors[k + 1]
    const above = a - from
    let to: number
    if (next === undefined) {
      // the last row: its wrapped lines, up to the first real gap (a note below the table stays apart)
      to = a + 1
      while (to < group.length && close(to) && (top || to < a + 1 + above)) to++
    } else if (top) to = next
    // as many lines below the date as above it, not past the next date
    else to = Math.min(next, a + 1 + above)
    rows.push(group.slice(from, to))
    from = to
  }
  rows.push(...group.slice(from).map((l) => [l]))
  return rows
}

/**
 * A page's lines as table rows. Lines closer together than the page's usual line spacing are one
 * row whose cells wrap; a wider gap starts the next row. A group holding more than one date is
 * several rows set without padding, split at its dates (splitAtDates).
 */
function pageRows(lines: PdfLine[]): string[] {
  // the spacing of wrapped lines: a low percentile of the gaps a line high or more, so padded rows
  // don't set it, nor the half-line gaps a cell centred in its row (often the date) leaves
  const gaps = lines
    .slice(1)
    .map((l, i) => ({ gap: lines[i].y - l.y, h: l.h }))
    .filter(({ gap, h }) => gap >= h * 0.8 && gap < h * 3)
    .map(({ gap }) => gap)
    .sort((a, b) => a - b)
  const unit = gaps.length >= 4 ? gaps[Math.floor(gaps.length * 0.25)] : 0
  const out: string[] = []
  let group: PdfLine[] = []
  const flush = () => {
    if (!group.length) return
    const text = (l: PdfLine) => l.cells.map((c) => c.text).join(' | ')
    const dated = group.map((l) => DATE_HINT.test(text(l)))
    const count = dated.filter(Boolean).length
    if (group.length === 1) out.push(text(group[0]))
    else if (count <= 1) out.push(mergeColumns(group))
    else out.push(...splitAtDates(group, dated).map((row) => (row.length > 1 ? mergeColumns(row) : text(row[0]))))
    group = []
  }
  for (const [i, line] of lines.entries()) {
    const gap = i ? lines[i - 1].y - line.y : 0
    if (i && (!unit || gap > Math.max(unit * 1.35 + 0.5, line.h * 1.45) || gap > line.h * 2.5)) flush()
    group.push(line)
  }
  flush()
  return out
}

/** A run of text as pdf.js gives it: the string, its transform (x and y at 4 and 5) and its width. */
interface PdfItem {
  str: string
  transform: number[]
  width: number
  height: number
}

/** One PDF page's text items as table rows (see pageRows). */
export function pdfPageRows(items: readonly object[]): string[] {
  const runs = items
    .filter((it): it is PdfItem => 'str' in it && typeof it.str === 'string' && it.str.trim() !== '')
    .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const grouped: (typeof runs)[] = []
  for (const r of runs) {
    const line = grouped.at(-1)
    if (line && Math.abs(line[0].y - r.y) <= Math.max(2, r.h * 0.45)) line.push(r)
    else grouped.push([r])
  }
  const lines: PdfLine[] = grouped.map((line) => {
    line.sort((a, b) => a.x - b.x)
    const cells: PdfCell[] = []
    let end = -Infinity
    for (const r of line) {
      const gap = r.x - end
      const cell = cells.at(-1)
      if (!cell || gap > r.h * 1.2) cells.push({ text: r.s, x0: r.x, x1: r.x + r.w })
      else {
        cell.text += (gap > r.h * 0.15 ? ' ' : '') + r.s
        cell.x1 = r.x + r.w
      }
      end = r.x + r.w
    }
    const hs = line.map((r) => r.h).sort((a, b) => a - b)
    return { y: line[0].y, h: hs[Math.floor(hs.length / 2)], cells }
  })
  return pageRows(lines)
}

/**
 * PDF text rebuilt into rows: pdf.js gives each run of text with its position, so runs on the same
 * line are put together in reading order, with " | " where a wide gap separates table columns, and
 * a row's wrapped lines are put back together (pageRows). Each page starts with a page mark.
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
      out.push(`⟦p${n}⟧`, ...pdfPageRows(content.items))
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
  /** the PDF page the row is on */
  page?: number
}

/** What a timeline document says: its dated sessions, and topics by week number when it has no dates. */
export interface Timeline {
  sessions: Session[]
  /** topics by number, for a lesson plan that numbers its rows instead of dating them */
  weeks: Record<number, string>
  /** what those numbers count: weeks ("Minggu ke-3", "Week 3"), or meetings ("Pertemuan 5"), of which a week can hold several */
  unit?: 'week' | 'meeting'
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
const WEEK = /\b(week|minggu|pekan|pertemuan|sesi|session|meeting|wk|w)\s*(?:ke\s*-?\s*)?(\d{1,2})(?:\s*(?:-|–|s\.?d\.?|,|&|dan|and)\s*(\d{1,2}))?\b/i
/** Words that number meetings rather than weeks (a week can hold two meetings). */
const MEETING_WORD = /^(?:pertemuan|sesi|session|meeting)$/i
/** A row marked as one of the term's weeks or meetings, numbered or not ("Week R1"). */
const WEEKISH = /\b(?:week|minggu|pekan|pertemuan|sesi|session|meeting)\b/i
/** A heading cell over a column of week or meeting numbers: "Minggu ke-", "Pertemuan", "Week". */
const NUMBER_HEADING = /^(week|weeks|minggu|pekan|pertemuan|sesi|session|meeting|no\.?)(?:\s*ke)?\s*-?$/i
/** A bare week number, or a range of them, opening a row: "3", "3-4", "3, 4". */
const BARE_NUMBER = /^\s*(\d{1,2})(?:\s*(?:-|–|,|&|s\.?d\.?)\s*(\d{1,2}))?\s*$/
// "minggu" is Sunday only before a comma or a date: "minggu tenang" is reading week
const DAY_ABBR = /\b(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu(?=\s*,|\s+\d)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|sen|sel|rab|kam|jum|sab)\b\.?,?/gi
const EXAM = /\b(uts|uas|ujian|midterm|mid-term|mid term|final exam|final test|final examination|exam|ujian akhir|ujian tengah|final(?!\s+(?:project|presentation|review|proyek)))\b/i
const OFF = /\b(libur|holiday|no class|no classes|no lecture|tidak ada kuliah|tidak ada kelas|cuti bersama|break|reading week|minggu tenang|dies natalis|day off)\b/i
/** Words of a table's column headings: a cell made only of them is a heading, not a topic. */
const HEADER_WORDS = new Set(
  'no no. # topic topics topik materi material materials subject subjects sub date dates tanggal week weeks minggu ke pekan pertemuan day hari notes note keterangan catatan lecturer lecturers dosen pengajar activity activities kegiatan session sessions sesi time waktu jam room ruang description deskripsi agenda content contents bahasan pokok reading readings reference references referensi pustaka assignment assignments tugas learning outcome outcomes expected kemampuan akhir yang diharapkan capaian method methods metode schedule jadwal assessment assessments penilaian criteria kriteria indikator indicator indicators weight weights bobot form bentuk mode moda delivery media and dan of / & - (%) bahan kajian pengalaman belajar mahasiswa sub sub-cpmk cpmk clo luaran rencana estimasi teknik instrumen rubrik pembelajaran kuliah learning experience estimated'.split(' '),
)
const isHeader = (cell: string) => cell.toLowerCase().split(/[\s/&()-]+/).filter(Boolean).every((w) => HEADER_WORDS.has(w))

/** The days a timeline can be about: the course's term, so revision dates and references are left out. */
export type Window = [from: number, to: number]

const dayStart = (y: number, m: number, d: number) => {
  const t = new Date(y, m, d)
  return t.getMonth() === m && t.getDate() === d ? t.getTime() : NaN
}

/**
 * A date in the window: with its year if written, else the year that puts it inside the window.
 * `typos`: on a row marked as one of the term's weeks, a written year a year off is taken as a
 * typo (lesson plans are copied from last year's: "29-Oct-2025" in a 2026/2027 plan).
 */
function resolve(day: number, mon: number, year: string | undefined, win: Window, typos = false): number {
  if (mon < 0 || day < 1 || day > 31) return NaN
  const inWin = [new Date(win[0]).getFullYear(), new Date(win[0]).getFullYear() + 1]
  const written = year ? (year.length === 2 ? 2000 + Number(year) : Number(year)) : NaN
  const years = !year ? inWin : typos && inWin.some((y) => Math.abs(y - written) === 1) ? [written, ...inWin] : [written]
  for (const y of years) {
    const t = dayStart(y, mon, day)
    if (t >= win[0] && t <= win[1]) return t
  }
  return NaN
}

/** The dates written in one line: single days, and spans covering several days. */
function datesIn(line: string, win: Window, typos = false) {
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
  // "26-Aug-2026", "26/Agu/26", "26.Okt.2026"
  take(new RegExp(String.raw`\b(\d{1,2})[-/.]${MON}[-/.](\d{4}|\d{2})\b`, 'gi'), (m) => singles.push(resolve(+m[1], monthOf(m[2]), m[3], win, typos)))
  // "24 Aug 2026", "Senin, 24 Agustus", "Aug 24, 2026", "24/08/2026", "2026-08-24"
  take(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MON}(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => singles.push(resolve(+m[1], monthOf(m[2]), m[3], win, typos)))
  take(new RegExp(String.raw`\b${MON}\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => singles.push(resolve(+m[2], monthOf(m[1]), m[3], win, typos)))
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => singles.push(resolve(+m[3], +m[2] - 1, m[1], win, typos)))
  take(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m) => singles.push(resolve(+m[1], +m[2] - 1, m[3], win, typos)))
  return { singles: singles.filter((t) => !Number.isNaN(t)), spans: spans.filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b)), rest, any }
}

/** How a class is held, as lesson plans list it in a column of its own. */
const METHOD = new Set(
  'lecture lectures lecturing discussion discussions ceramah diskusi tanya jawab q&a qa presentation presentasi self study self-study belajar mandiri tatap muka face to face face-to-face online offline hybrid daring luring onsite on-site synchronous asynchronous sinkron asinkron zoom teams ms gmeet google meet video conference interactive interaktif problem based learning pbl case study studi kasus demo demonstration demonstrasi exercise exercises latihan practice praktik group work kerja kelompok flipped classroom blended scele elearning e-learning lms tm bt bm pt ps kuliah perkuliahan praktikum responsi asistensi tutorial mandiri terstruktur penugasan tugas quiz kuis'.split(' '),
)
/** Cells that hold no topic: scheduling notes, references, weights, durations, lecturers' initials. */
const NOT_TOPIC = [
  /^(?:planned to be scheduled|to be (?:announced|scheduled|confirmed|determined)|tba|tbd|tbc|n\/a|none|-+|menyesuaikan|sesuai jadwal|akan diumumkan)$/i,
  /^\[?\d+\]?(?:\s*[,;&]\s*\[?\d+\]?)*$/, // [1], [2, 3]
  /^(?:ref(?:erence|erensi)?s?|pustaka|bacaan|readings?)\b/i,
  /^(?:\[?\d+\]?\s*)?(?:ch(?:apter|\.)?|bab|hal(?:aman)?\.?|pp?\.|pages?)\s*\d[\d\s,.\-–]*$/i,
  /^\d+(?:[.,]\d+)?\s*%$/,
  /^\d+\s*[x×]\s*\d+\s*(?:'|menit|min(?:utes?)?)?\.?$/i, // 2 x 50'
  /^\d+\s*(?:menit|minutes?|mins?|jam|hours?|sks|credits?)$/i,
  /^(?:(?:tm|bt|bm|pt|ps|kuliah|praktikum|tutorial)\s*[:=]?\s*\d+\s*[x×]\s*\d+\s*(?:'|"|menit|min)?[\s,;]*)+$/i, // TM: 2x50', BM: 2x60'
  /^[A-Z]{2,4}(?:\s*[/,&]\s*[A-Z]{2,4})+$/, // "ABC/DEF": the lecturers teaching it (a lone "SQL" may be the topic)
]
/**
 * Cells a lesson plan keeps beside the topic that describe the class rather than its content: a
 * learning outcome ("Students are able to …", "Mahasiswa mampu …"), what students do there
 * ("Mendengarkan ceramah", "Listening to the lecture") and how it is graded ("Ketepatan
 * menjelaskan …"). Kept only when a row has nothing else.
 */
const OUTCOME =
  /^(?:students?|mahasiswa|peserta|able to|mampu|dapat|can|understand|memahami|(?:sub-?\s*)?cpmk|clo|lo|mendengarkan|menyimak|memperhatikan|membaca|mengerjakan|berdiskusi|bertanya|menjawab|mencatat|menyelesaikan|listening|listen|reading|discussing|ketepatan|kesesuaian|kemampuan|kebenaran|kelengkapan|keaktifan|kriteria|indikator|accuracy|correctness|ability)\b/i

const isMethod = (cell: string) => {
  const parts = cell
    .toLowerCase()
    .split(/\s*(?:[,/&+;]|\band\b|\bdan\b)\s*/)
    .filter(Boolean)
  return parts.length > 0 && parts.every((p) => p.split(/\s+/).every((w) => METHOD.has(w)))
}

/**
 * What a row is about: its cells without dates, times, days, week numbers and column headings,
 * and without the columns a lesson plan keeps beside the topic (how it's taught, references,
 * weights, a "planned to be scheduled" note). A learning outcome stands in when nothing else is left.
 */
function topicOf(rest: string): string {
  const cells = rest
    .replace(new RegExp(TIME.source, 'gi'), ' ')
    .replace(DAY_ABBR, ' ')
    .replace(new RegExp(WEEK.source, 'gi'), ' ')
    .replace(/\b(?:[Ww]eek|WEEK|[Mm]inggu|[Pp]ekan)\s*[A-Z]\d{0,2}\b/g, ' ')
    .replace(/⟦⟧/g, ' ')
    .replace(/\bWIB\b/gi, ' ')
    .split('|')
    .map((c) =>
      c
        .replace(/^[\s\d.,:;()\-–—#]+|[\s,:;(\-–—]+$/g, '')
        .replace(/^(?:topics?|topik|materi|materials?|pokok bahasan|bahasan|sub[- ]?topics?|subject)\s*[:\-–]\s*/i, '')
        .trim(),
    )
    .filter((c) => /\p{L}{3,}/u.test(c) && !isHeader(c) && !NOT_TOPIC.some((re) => re.test(c)) && !isMethod(c))
  const topics = cells.filter((c) => !OUTCOME.test(c))
  return (topics.length ? topics : cells).join(' · ').slice(0, 200)
}

/** A labelled note below a table: "Textbook: …", "Referensi: …", "Catatan: …". */
const NOTE = /^\s*(?:textbooks?|books?|buku|references?|referensi|pustaka|sumber|notes?|catatan|keterangan|remarks?)\s*(?:utama)?\s*:/i

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
  let unit: Timeline['unit']
  let last: Session | null = null
  let carried = 0
  let page: number | undefined
  // a column of bare numbers under a "Minggu ke- / Pertemuan / Week" heading: rows start with their number
  let numbered: 'week' | 'meeting' | null = null
  for (const line of text.split('\n')) {
    const mark = line.match(PAGE_MARK)
    if (mark) {
      page = Number(mark[1])
      // a row doesn't run on over a page break: the next page starts with its own rows or headings
      last = null
      continue
    }
    const time = line.match(TIME)
    const cells = line.split('|').map((c) => c.trim())
    const heading = cells[0].match(NUMBER_HEADING)
    const filled = cells.filter(Boolean)
    if (heading && filled.length > 1 && filled.filter((c) => isHeader(c)).length >= filled.length * 0.6 && !DATE_HINT.test(line)) {
      numbered = MEETING_WORD.test(heading[1]) ? 'meeting' : heading[1].toLowerCase().startsWith('no') ? null : 'week'
      if (numbered) unit ??= numbered
      last = null
      continue
    }
    // the week (or meeting) numbers a row is for: "Week 3", "Minggu ke-3", "Pertemuan 5-6", or a bare
    // number opening the row under a numbering heading
    const marked = line.match(WEEK)
    const bare = numbered && !marked ? cells[0].match(BARE_NUMBER) : null
    const nums = marked ? [marked[2], marked[3]] : bare ? [bare[1], bare[2]] : []
    const [lo, hi = lo] = nums.filter(Boolean).map(Number)
    const week = lo !== undefined ? { lo, hi: hi >= lo && hi - lo < 4 ? hi : lo, meeting: marked ? MEETING_WORD.test(marked[1]) : numbered === 'meeting' } : null
    const body = bare ? cells.slice(1).join(' | ') : line
    const { singles, spans, rest, any } = datesIn(body.replace(new RegExp(TIME.source, 'g'), ' '), win, Boolean(week) || WEEKISH.test(line))
    const topic = topicOf(rest)
    const kind = kindOf(line)
    const base = {
      topic,
      kind,
      week: week?.lo,
      ...(time ? { start: `${time[1].padStart(2, '0')}:${time[2]}`, end: `${time[3].padStart(2, '0')}:${time[4]}` } : {}),
      ...(page ? { page } : {}),
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
      for (let n = week.lo; n <= week.hi; n++) weeks[n] = weeks[n] ? `${weeks[n]} · ${topic}`.slice(0, 200) : topic
      if (!unit) unit = week.meeting ? 'meeting' : 'week'
      last = null
    } else if (last && topic && !any && carried < 2 && last.topic.length < 110 && !NOTE.test(line)) {
      last.topic = [last.topic, topic].filter(Boolean).join(' · ').slice(0, 200)
      if (kindOf(topic) !== 'class') last.kind = kindOf(topic)
      carried++
    } else last = null
  }
  const sessions = [...byDate.values()].sort((a, b) => a.date - b.date)
  const dated = sessions.filter((s) => !s.until && s.kind === 'class').length
  if (dated < 3 && sessions.length < 4 && Object.keys(weeks).length < 5) return null
  return { sessions, weeks, ...(Object.keys(weeks).length ? { unit: unit ?? 'week' } : {}) }
}

/**
 * The timeline dates its weeks rather than its classes: about one dated row per week, as a lesson
 * plan dates each week ("Week 07 · 29-Oct · Virtual Memory") while the class meets on other days too.
 */
function weekly(t: Timeline): boolean {
  const rows = t.sessions.filter((s) => !s.until && s.kind !== 'off')
  if (rows.length < 3) return false
  return new Set(rows.map((s) => mondayOf(s.date))).size >= rows.length * 0.85
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
  // one date a week that keeps changing weekday dates the weeks, not the classes
  if (weekly(t) && Math.max(...[...count.values()].map((l) => l.length)) < dated.length * 0.6) return []
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
  /** the PDF page it is written on */
  page?: number
}

const WEEK_MS = 7 * 86_400_000
/** Monday of the week a day is in (local midnight). */
export function mondayOf(t: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}

/** Which of a course's weekly meetings this is: `index` of `perWeek` (0 = the week's first). */
export interface MeetingOfWeek {
  perWeek: number
  index: number
}

/**
 * What the timeline says about the class on `date`, most specific first: a row for that day; a row
 * dating that week, in a timeline that dates its weeks (the class on Friday of "Week 07 · Thu 29 Oct");
 * a span of days it falls in; else the numbered row for its week (or meeting), counted from
 * `termStart`, the Monday of the term's first week.
 */
export function agendaOn(t: Timeline, date: number, termStart: number, meeting: MeetingOfWeek = { perWeek: 1, index: 0 }): Agenda | null {
  const day = new Date(new Date(date).getFullYear(), new Date(date).getMonth(), new Date(date).getDate()).getTime()
  const exact = t.sessions.filter((s) => !s.until && s.date === day)
  if (exact.length) {
    const kind = exact.some((s) => s.kind === 'off') ? 'off' : exact.some((s) => s.kind === 'exam') ? 'exam' : 'class'
    return { topic: exact.map((s) => s.topic).filter(Boolean).join(' · '), kind, exact: true, week: exact[0].week, page: exact[0].page }
  }
  // a holiday on another day of the week is that day's, never this one's
  const sameWeek = weekly(t) ? t.sessions.filter((s) => !s.until && s.kind !== 'off' && mondayOf(s.date) === mondayOf(day)) : []
  if (sameWeek.length) {
    const s = sameWeek.filter((x) => x.date <= day).at(-1) ?? sameWeek[0]
    return { topic: s.topic, kind: s.kind, exact: false, week: s.week, page: s.page }
  }
  const span = t.sessions.find((s) => s.until && day >= s.date && day < s.until)
  if (span) return { topic: span.topic, kind: span.kind, exact: false, week: span.week, page: span.page }
  // numbered rows: weeks from the term's start (a plan may count from Week 0), or meetings, of
  // which each week holds `perWeek`
  const first = termStart || (t.sessions[0] ? mondayOf(t.sessions[0].date) : 0)
  if (first && Object.keys(t.weeks).length && day >= first) {
    const w = Math.floor((mondayOf(day) - mondayOf(first)) / WEEK_MS) + 1
    const n = t.unit === 'meeting' ? (w - 1) * Math.max(1, meeting.perWeek) + meeting.index + 1 : w
    const key = 0 in t.weeks ? n - 1 : n
    if (t.weeks[key]) return { topic: t.weeks[key], kind: kindOf(t.weeks[key]), exact: false, week: t.unit === 'meeting' ? w : key }
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
