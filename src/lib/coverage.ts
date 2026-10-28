/**
 * Which part of a course page covers a meeting's topic: the section about it and the materials in
 * it. Words are weighed by how few sections use them, so a topic shares more than one common word
 * ("random" in "simple, systematic, stratified, random sampling" vs "Random Variables") with what
 * it is matched to. Nothing is shown rather than something unrelated.
 */
import { SCELE_URL, type Course, type SceleModule, type Section } from './scele'

const STOP = new Set(
  `the and for with from into this that these those its are was were what how why when which about using use based
  dan yang untuk dengan pada dari dalam atau serta oleh ini itu adalah sebagai secara tentang menggunakan berbasis
  week weeks minggu pekan pertemuan sesi session sessions meeting lecture lectures kuliah class kelas part bagian chapter bab
  topic topics topik materi material materials introduction intro pengantar overview review recap summary ringkasan
  slide slides ppt pptx pdf doc notes note catatan handout file files video videos recording rekaman link links
  forum forums discussion diskusi assignment assignments tugas quiz kuis exercise exercises latihan practice tutorial lab
  praktikum worksheet problem problems soal answer answers jawaban key kunci solution solutions pembahasan
  unit module modul course mata kuliah term semester odd even gasal genap new update updated revisi revised final draft
  planned scheduled schedule jadwal tba`.split(/\s+/),
)

/** "sampling" and "samples" alike: lower case, a plural or -ing/-ed ending off, at most six letters. */
const stem = (w: string) => w.replace(/(?:ings?|ed|es|s)$/, '').slice(0, 6)

function terms(text: string, skip: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const w of text.toLowerCase().match(/\p{L}[\p{L}\p{N}]{2,}/gu) ?? []) {
    if (STOP.has(w)) continue
    const s = stem(w)
    if (s.length >= 3 && !skip.has(s)) out.add(s)
  }
  return out
}

/** Only what a student opens to study: files, pages, links, folders, books. */
const STUDY = new Set(['resource', 'url', 'page', 'folder', 'book', 'lesson', 'h5pactivity', 'imscp'])
const DAY = 86_400_000

export interface Coverage {
  /** the course section about the topic, with a link straight to it */
  section: { name: string; url: string } | null
  materials: SceleModule[]
}

const sectionUrl = (courseId: number, s: Section) => `${SCELE_URL}/course/view.php?id=${courseId}#section-${s.num}`

/**
 * The section and materials of a course that go with `topic`, for a meeting on `date`.
 * `fallback` is a section already known to be the meeting's (dated or numbered for its week),
 * used when the words alone don't settle it.
 */
export function coverage(course: Course, sections: Section[], topic: string, date: number, fallback: Section | null = null): Coverage {
  // the course's own name is on everything in it, so it says nothing about a topic
  const skip = terms(`${course.full} ${course.short}`, new Set())
  const want = terms(topic, skip)
  const body = sections.filter((s) => s.num > 0)
  const docs = body.map((s) => ({ s, t: terms([s.name, s.summary, ...s.modules.map((m) => m.name)].join(' '), skip) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.t) df.set(t, (df.get(t) ?? 0) + 1)
  const n = Math.max(docs.length, 1)
  const idf = (t: string) => Math.log(1 + n / (df.get(t) ?? 0.5))
  // a word few sections use: it tells them apart
  const rare = (t: string) => (df.get(t) ?? 0) <= Math.max(2, n * 0.2)

  // the section: the one sharing the most weight with the topic, at least two of its words (its
  // only word, for a one-word topic) and one of them rare in the course
  let best: { s: Section; score: number } | null = null
  if (want.size) {
    for (const { s, t } of docs) {
      const shared = [...want].filter((w) => t.has(w))
      if (shared.length < Math.min(2, want.size) || !shared.some(rare)) continue
      const score = shared.reduce((sum, w) => sum + idf(w), 0)
      if (!best || score > best.score) best = { s, score }
    }
  }
  const section = best?.s ?? fallback

  // its study materials first, then any other material wholly about the topic: every word of its
  // name is in it, and it has two such words or was posted around the meeting. Beside a matched
  // section, only one posted around the meeting ("Multiple Random Variables" is not this week's
  // just because the topic is random variables).
  const picked: { m: SceleModule; rank: number }[] = []
  if (section) for (const m of section.modules) if (STUDY.has(m.mod)) picked.push({ m, rank: 2 })
  if (want.size) {
    for (const s of body) {
      if (s === section) continue
      for (const m of s.modules) {
        if (!STUDY.has(m.mod)) continue
        const name = terms(m.name, skip)
        if (!name.size || ![...name].every((w) => want.has(w))) continue
        const posted = (m.files ?? []).some((f) => f.modified * 1000 > date - 14 * DAY && f.modified * 1000 < date + 2 * DAY)
        if (posted || (!section && name.size >= 2)) picked.push({ m, rank: posted ? 1 : 0 })
      }
    }
  }
  return {
    section: section ? { name: section.name, url: sectionUrl(course.id, section) } : null,
    materials: picked
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 4)
      .map((x) => x.m),
  }
}
