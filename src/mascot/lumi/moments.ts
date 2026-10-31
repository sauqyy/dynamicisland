import type { LumiMood } from './moods'

/** What Lumi says for a mood, written for someone called `n` (a first name, or nothing yet). */
export interface Say {
  title: string
  sub?: string
}

const hi = (n: string) => (n ? `, ${n}` : '')

/**
 * One example line for every mood: what the demo page shows, and the wording the routines use when
 * there is nothing more specific to say. Several have more than one version, picked at random, so she
 * does not sound the same every time.
 */
export const SAY: Partial<Record<LumiMood, (n: string) => Say[]>> = {
  idle: () => [{ title: '' }],
  sleep: (n) => [{ title: `Shh${hi(n)}`, sub: 'I dozed off. Tap me when you need me.' }],
  wake: () => [{ title: 'Oh! You are back', sub: "I'm awake, I'm awake." }],

  hello: (n) => [{ title: `Hello${hi(n)}!`, sub: "I'm Lumi. Nice to see you." }],
  goodMorning: (n) => [
    { title: `Good morning${hi(n)}`, sub: 'Here is the day, ready when you are.' },
    { title: `Morning${hi(n)}! New day`, sub: 'Shall we see what is on?' },
  ],
  goodNight: (n) => [
    { title: `Good night${hi(n)}`, sub: 'Everything is saved. Sleep well.' },
    { title: 'Time to wind down', sub: 'Tomorrow will still have its deadlines. Rest.' },
  ],
  welcomeBack: (n) => [
    { title: `Welcome back${hi(n)}!`, sub: 'I looked after everything while you were gone.' },
    { title: `There you are${hi(n)}`, sub: "I missed you. Let me tell you what's new." },
    { title: `Hi${hi(n)}, you're back!`, sub: 'I hope you rested well. Ready when you are.' },
  ],
  updated: () => [{ title: "I've got something new for you", sub: 'A few things changed while you were away. Come and see!' }],

  class1h: () => [{ title: 'Class in 1 hour', sub: 'Pemrograman Web · Room 2.2301' }],
  class10m: () => [{ title: 'Class in 10 minutes', sub: 'Pemrograman Web · Room 2.2301. Time to head over.' }],
  classNow: () => [{ title: 'Class is starting', sub: 'Pemrograman Web · Room 2.2301' }],
  classDone: (n) => [
    { title: 'Class is over', sub: `Nice work${hi(n)}. Breathe for a moment.` },
    { title: "That's a wrap", sub: 'Anything to note down while it is fresh?' },
  ],

  examTomorrow: (n) => [{ title: 'Exam tomorrow', sub: `Algoritma, 09:00. You've got this${hi(n)}.` }],
  examLuck: (n) => [{ title: `Good luck${hi(n)}!`, sub: 'Algoritma starts soon. Deep breath.' }],
  examDone: (n) => [
    { title: `You finished the exam${hi(n)}!`, sub: 'However it went, that was hard work. Go rest.' },
    { title: 'Exam done!', sub: 'Whatever happens, you showed up. Proud of you.' },
  ],

  due3d: () => [{ title: 'Tugas 2 is due in 3 days', sub: 'Plenty of time. Lean back, but not too far.' }],
  due2d: () => [{ title: 'Tugas 2 is due in 2 days', sub: 'Two days. Maybe a peek at it today?' }],
  due24h: () => [{ title: 'Tugas 2 is due tomorrow', sub: 'Time for a plan. Even a rough one counts.' }],
  due12h: () => [{ title: 'Tugas 2 is due in 12 hours', sub: 'Glasses on. Let us get it started.' }],
  due6h: () => [{ title: 'Tugas 2 is due in 6 hours', sub: 'Still a draft · not submitted' }],
  due3h: () => [{ title: 'Tugas 2 is due in 3 hours', sub: 'Still a draft · not submitted' }],
  due1h: () => [{ title: 'Tugas 2 is due in 1 hour', sub: 'Still a draft · not submitted' }],
  overdue: () => [{ title: 'Tugas 2 is overdue', sub: 'SCELE may still take it. Try submitting.' }],
  submitted: (n) => [
    { title: `Submitted${hi(n)}! Well done`, sub: 'Tugas 2 · 3 hours early. Reminders are off.' },
    { title: 'Handed in, nicely done', sub: 'Tugas 2 is in. Take a breather.' },
  ],
  graded: () => [{ title: 'A new grade is in', sub: 'Algoritma · Quiz 2. Open Due to see it.' }],
  allClear: (n) => [
    { title: `Nothing due this week${hi(n)}`, sub: 'A rare calm. Enjoy it.' },
    { title: "You're all caught up", sub: 'No deadlines in sight.' },
  ],

  announcement: () => [{ title: 'New announcement', sub: 'PPW: Deadline Lab 8 diundur ke Jumat.' }],
  newMaterial: () => [{ title: 'New in Algoritma', sub: 'Slide AVL Tree is up on SCELE.' }],

  focusStart: () => [{ title: "Let's focus", sub: '25 minutes. I will keep quiet.' }],
  focusDone: (n) => [
    { title: `Focus session done${hi(n)}`, sub: 'That was a solid one.' },
    { title: 'Time!', sub: 'You stayed with it the whole way.' },
  ],
  breakTime: () => [{ title: 'Break time', sub: 'Stand up, get a drink, look away from the screen.' }],
  hydrate: () => [{ title: 'Drink some water', sub: "It's been a while. I'll wait." }],
  eyeRest: () => [{ title: 'Rest your eyes', sub: 'Look at something far away for 20 seconds.' }],
  stretch: () => [{ title: 'Stretch break', sub: 'Stand up and roll your shoulders. Together?' }],
  lowBattery: () => [{ title: 'Battery is low', sub: '15% left. Find a charger soon.' }],
  charging: () => [{ title: 'Charging', sub: 'Ahh, thank you. Energy coming back.' }],
  lateNight: (n) => [
    { title: `It's late${hi(n)}`, sub: 'Your deadlines will keep. Your sleep will not.' },
    { title: 'Still up?', sub: 'A rested brain does better work. Just saying.' },
  ],

  todoDone: () => [{ title: 'Ticked off', sub: 'One less thing.' }],
  allTodosDone: (n) => [
    { title: `Everything is done${hi(n)}!`, sub: 'Your to-do list is empty. Amazing.' },
    { title: 'List cleared!', sub: 'Every single one. Treat yourself.' },
  ],

  message: () => [{ title: 'Rina wrote to you', sub: 'Are you free tonight?' }],
  speaking: (n) => [{ title: 'Here is what I found', sub: `You have 2 classes and 1 deadline today${hi(n)}.` }],
  thinking: () => [{ title: 'One moment', sub: 'Checking SCELE…' }],
  confirm: () => [{ title: 'Quick check', sub: 'You submitted Tugas 2. Remove it from your to-dos?' }],
  error: () => [{ title: "I couldn't reach SCELE", sub: 'Your connection may be down. I will try again.' }],
}

/** One of the lines for a mood, at random. */
export function say(mood: LumiMood, name: string): Say {
  const all = SAY[mood]?.(name) ?? [{ title: '' }]
  return all[Math.floor(Math.random() * all.length)]
}

const HOUR = 3600_000

/** a line added to a deadline reminder, by how close it is: the island has been telling you to lock in since the three-day mark */
export const DUE_QUIP: Partial<Record<LumiMood, string>> = {
  due3d: 'plenty of time',
  due2d: 'maybe a peek today?',
  due24h: 'time for a plan',
  due12h: 'glasses on',
  due6h: 'sit up, start now',
  due3h: 'phone away',
  due1h: 'time to lock in.',
}

/** "in 2h 30m", "in 3d", "in 40m" → milliseconds, or null */
function leftIn(t: string): number | null {
  const m = t.match(/\bin\s+(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\b/i)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  return (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * HOUR + Number(m[3] ?? 0) * 60_000
}

/**
 * The mood for an alert the app already raises (a class about to start, a deadline, a grade, a break...),
 * from its icon and wording. null when it is a plain system notice, which keeps its usual icon.
 */
export function moodForAlert(a: { icon: string; text: string; sub?: string; kind?: string; avatar?: unknown }): LumiMood | null {
  if (a.kind) return null // volume, brightness: meters, not moments
  const text = `${a.text} ${a.sub ?? ''}`
  switch (a.icon) {
    case '🎓': {
      if (/class over/i.test(a.text)) return 'classDone'
      if (/class mode on/i.test(a.text)) return 'classNow'
      const left = leftIn(a.text)
      if (left === null) return /\bnow\b|started|today/i.test(a.text) ? 'classNow' : 'class1h'
      return left <= 15 * 60_000 ? 'class10m' : 'class1h'
    }
    case '📅': {
      if (/schedule changed/i.test(text)) return 'announcement'
      if (/no .* class today/i.test(a.text)) return 'allClear'
      if (/overdue|ago|late/i.test(a.sub ?? '')) return 'overdue'
      const left = leftIn(a.sub ?? '')
      if (left === null) return 'due24h'
      // the reminders come at 72, 48, 24, 12, 6, 3 and 1 hours: each is the rung nearest to what is left
      return left <= 2 * HOUR ? 'due1h' : left <= 4.5 * HOUR ? 'due3h' : left <= 9 * HOUR ? 'due6h' : left <= 18 * HOUR ? 'due12h' : left <= 36 * HOUR ? 'due24h' : left <= 60 * HOUR ? 'due2d' : 'due3d'
    }
    case '⚠️':
      if (/failed|error|could not|couldn't/i.test(text)) return 'error'
      return /due|dl/i.test(a.sub ?? '') ? (leftIn(a.sub ?? '') !== null && leftIn(a.sub ?? '')! <= 2 * HOUR ? 'due1h' : 'due6h') : 'error'
    case '✅':
      return /submitted|handed|well done/i.test(text) ? 'submitted' : /session done/i.test(text) ? 'focusDone' : 'todoDone'
    case '🏅':
      return 'graded'
    case '🌧️':
      return /stop|ease/i.test(a.text) ? 'rainEnds' : /rainy day/i.test(a.text) ? 'rainyDay' : /it's raining|raining now/i.test(a.text) ? 'rainNow' : 'rainSoon'
    case '☂️':
      return 'rainSoon'
    case '⛈️':
      return 'storm'
    case '🌡️':
      return 'hot'
    case '☀️':
      return 'strongSun'
    case '📣':
      return 'announcement'
    case '📄':
      return 'newMaterial'
    case '🎯':
      return 'focusStart'
    case '☕':
      return 'breakTime'
    case '⏰':
      return 'focusDone'
    case '📚':
      return /done/i.test(a.text) ? 'focusDone' : 'focusStart'
    case '👀':
      return 'eyeRest'
    case '🧘':
      return 'stretch'
    case '🪫':
      return 'lowBattery'
    case '⚡':
      return 'charging'
    case '💬':
    case '👥':
      return 'message'
    default:
      return null
  }
}
