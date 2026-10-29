import type { Action } from './actions'
import type { Routine } from './settings'

/** Small number words, so "set a five minute timer" works as well as "set a 5 minute timer". */
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 }
/** a number as digits or words, including "twenty five" and "twenty-five" */
const num = (t: string) => (/^\d/.test(t) ? Number(t) : t.toLowerCase().split(/[\s-]+/).reduce((sum, w) => sum + (WORDS[w] ?? 0), 0))

const minutesOf = (n: number, unit: string) => (/^(h|hr|hrs|hour|hours)$/i.test(unit) ? n * 60 : /^sec/i.test(unit) ? n / 60 : n)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const DOMAIN = /^(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i

/**
 * Turns a plain spoken command into an action, or null when it is not one of the simple ones.
 * This is the fast path: it runs right away, without asking Claude, and it is also what each line of a routine means.
 */
export function parseIntent(raw: string, routines: Routine[] = []): Action | null {
  let t = raw
    // sentence punctuation goes, but the dot inside "youtube.com" stays
    .replace(/[,!?;]+/g, ' ')
    .replace(/\.+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  t = t
    .replace(/^(?:(?:and|so|um|uh|er|hmm|well|then|yeah|like) )+/i, '')
    .replace(/^(?:(?:hey|ok|okay) )?(?:(?:please|can you|could you|would you|will you|i want you to|i would like you to|i need you to|i want to|let's|lets) )*/i, '')
    .replace(/ please$/i, '')
    .trim()
  if (!t) return null

  // your own routines come first, so "study mode" is yours even if it sounds like something else
  for (const r of routines) {
    const n = escape(squash(r.name))
    if (!n) continue
    if (new RegExp(`^(?:(?:run|start|activate|do|begin|launch|open) )?(?:my |the )?${n}(?: routine| mode)?$`, 'i').test(squash(t))) return { type: 'routine', name: r.name }
  }

  let m: RegExpMatchArray | null

  // volume
  if ((m = t.match(/^(?:set )?(?:the )?(?:volume|sound)(?: to| at)? (\d{1,3})(?: percent|%)?$/i))) return { type: 'volume', op: 'set', value: Math.min(100, Number(m[1])) }
  if (/^(?:(?:turn|make) )?(?:the )?(?:volume|sound)(?: it)? (?:up|higher|louder)$|^(?:louder|turn it up|turn up|volume up)$/i.test(t)) return { type: 'volume', op: 'up' }
  if (/^(?:(?:turn|make) )?(?:the )?(?:volume|sound)(?: it)? (?:down|lower|quieter|softer)$|^(?:quieter|softer|turn it down|turn down|volume down)$/i.test(t)) return { type: 'volume', op: 'down' }
  if (/^(?:mute|silence)(?: the| my)?(?: sound| volume| music| computer| laptop)?$/i.test(t)) return { type: 'volume', op: 'mute' }
  if (/^unmute(?: the| my)?(?: sound| volume| music| computer| laptop)?$/i.test(t)) return { type: 'volume', op: 'unmute' }

  // music
  if (/^(?:pause|stop)(?: the| my)?(?: music| song| track| playback| playing)?$/i.test(t)) return { type: 'media', op: 'pause' }
  if (/^(?:play|resume|continue|unpause)(?: the| my)?(?: music| song| track| playback)?$/i.test(t)) return { type: 'media', op: 'play' }
  if (/^(?:(?:play|go to) )?(?:the )?next(?: song| track| one)?$|^skip(?: the)?(?: song| track| this| it)?$/i.test(t)) return { type: 'media', op: 'next' }
  if (/^(?:(?:play|go to) )?(?:the )?(?:previous|last)(?: song| track| one)?$|^go back$/i.test(t)) return { type: 'media', op: 'previous' }

  // timers
  const unit = '(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|m)'
  const n = '(\\d+(?:\\.\\d+)?|(?:twenty|thirty|forty|fifty|sixty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)'
  if ((m = t.match(new RegExp(`^(?:(?:set|start|create|make) )?(?:an? )?${n}[ -]?${unit}[ -]timer$`, 'i'))) || (m = t.match(new RegExp(`^(?:(?:set|start|create|make) )?(?:an? )?timer (?:for |of )?${n} ?${unit}$`, 'i')))) {
    const v = num(m[1])
    if (v > 0) return { type: 'timer', minutes: minutesOf(v, m[2]) }
  }

  // to-dos
  // "add buy milk to my to-do list", "put call the dentist on the todo list", "write laundry in my tasks"
  if ((m = t.match(new RegExp(String.raw`^(?:add|put|write|save|include|insert|create|make|note) (.+?) (?:to|on|in|into|onto) (?:my |the |our )?(?:to[- ]?do(?:'?s)?|todo|task|tasks|checklist)(?: list)?$`, 'i')))) return { type: 'todo', text: cap(m[1]) }
  // "add to my to-do list: buy milk"
  if ((m = t.match(new RegExp(String.raw`^(?:add|put) (?:to|on|in|into) (?:my |the |our )?(?:to[- ]?do(?:'?s)?|todo|task|tasks|checklist)(?: list)?[:, ]+(.+)$`, 'i')))) return { type: 'todo', text: cap(m[1]) }
  // "add a task called buy milk", "create a new to-do: buy milk"
  if ((m = t.match(/^(?:add|create|make) (?:a |an )?(?:new )?(?:to[- ]?do|task|reminder)(?: called| named| to| for| that says)?[: ]+(.+)$/i))) return { type: 'todo', text: cap(m[1]) }
  if ((m = t.match(/^(?:add )?(?:a )?(?:to[- ]?do|task)[: ]+(.+)$/i))) return { type: 'todo', text: cap(m[1]) }
  if ((m = t.match(/^remind me to (.+)$/i))) return { type: 'todo', text: cap(m[1]) }

  // web search
  if ((m = t.match(/^(?:google|search(?: google| the web| online)?(?: for)?|look up) (.+)$/i))) return { type: 'search', query: m[1] }

  // power (these always ask before doing anything)
  if (/^lock(?: the| my)?(?: computer| pc| laptop| screen)?$/i.test(t)) return { type: 'power', op: 'lock' }
  if (/^(?:go to )?sleep$|^put (?:the |my )?(?:computer|pc|laptop) (?:to )?sleep$/i.test(t)) return { type: 'power', op: 'sleep' }
  if (/^(?:shut ?down|turn off)(?: the| my)?(?: computer| pc| laptop)?$/i.test(t)) return { type: 'power', op: 'shutdown' }
  if (/^restart(?: the| my)?(?: computer| pc| laptop)?$/i.test(t)) return { type: 'power', op: 'restart' }

  // open something: a website, or an app / shortcut (checked against what is installed later)
  if ((m = t.match(/^(?:open|launch|start|run|go to|bring up|show me) (.+)$/i))) {
    const target = m[1].trim()
    if (DOMAIN.test(target.replace(/\s+dot\s+/gi, '.'))) return { type: 'open_url', url: target.replace(/\s+dot\s+/gi, '.') }
    return { type: 'open_app', name: target }
  }
  return null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
