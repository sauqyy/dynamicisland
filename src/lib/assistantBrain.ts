import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import type { Persona, Settings } from './settings'
import { chatLocal, type LlmMsg } from './localBrain'
import { chatClaude } from './claudeAccount'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

/** The settings the brain reads, so a change in the rest of Settings never rebuilds the assistant. */
export type BrainSettings = Pick<
  Settings,
  'assistantEngine' | 'assistantLocalModel' | 'assistantModel' | 'assistantPersona' | 'assistantLength' | 'assistantUserName' | 'assistantStyle' | 'mascotName' | 'assistantTools' | 'assistantAliases' | 'assistantRoutines'
>

const PERSONA: Record<Persona, string> = {
  cheerful: 'You are warm, upbeat and a little playful, like a good friend who is happy to help.',
  calm: 'You are calm, gentle and unhurried. You speak softly and never rush the person.',
  sassy: 'You are witty and a bit cheeky, with dry humour, but never rude and always actually helpful.',
  pro: 'You are polished, concise and professional, like an excellent personal assistant.',
}

/** keys for optional online services (the paid natural voice) */
export type KeyKind = 'openai'
export const hasKey = (kind: KeyKind = 'openai') => (IS_TAURI ? invoke<boolean>('assistant_has_key', { kind }).catch(() => false) : Promise.resolve(false))
export const setKey = (key: string, kind: KeyKind = 'openai') => invoke('assistant_set_key', { key, kind })
export const clearKey = (kind: KeyKind = 'openai') => invoke('assistant_clear_key', { kind })

/** The prompt for the small local model: instead of tool calls it is taught to write plain "DO:" lines. */
export function localSystemPrompt(s: BrainSettings, context: string, canAct: boolean) {
  const name = s.mascotName.trim() || 'Astra'
  const user = s.assistantUserName.trim()
  const aliases = s.assistantAliases.filter((a) => a.name.trim() && a.target.trim())
  const routines = s.assistantRoutines.filter((r) => r.name.trim())
  return [
    `You are ${name}, a tiny voice assistant who lives in the user's "Astra Isle", a pill at the top of their computer screen.`,
    PERSONA[s.assistantPersona],
    'Your answers are spoken aloud. Write plain spoken sentences only: no markdown, no lists, no headings, no emoji.',
    s.assistantLength === 'short' ? 'Keep every answer to one to three short sentences, under about 40 words, unless asked for more.' : 'Keep answers brief but complete, usually under about 90 words.',
    'The text you receive is dictated speech, so it may contain small recognition mistakes. Quietly work out what the person meant.',
    'If you do not know something, say so briefly instead of guessing.',
    canAct
      ? [
          'You can control the computer. When the user asks you to DO something, write one line per action that starts with DO: followed by a short plain command, and then one short sentence saying what you are doing.',
          'Commands you may use: open <app or website>; volume up; volume down; set volume to <number>; mute; unmute; play music; pause music; next song; previous song; set a <number> minute timer; add <text> to my to-do list; search for <text>.',
          'Example: the user says "open spotify and turn it up". You write:',
          'DO: open Spotify',
          'DO: volume up',
          'Opening Spotify and turning the volume up.',
          'Only write a DO line when the user clearly asked for that action. Never write a DO line for a normal question.',
          'Every action you mention needs its own DO line, and you must never say you did something without writing its DO line. Use only the commands listed above, worded as shown.',
        ].join('\n')
      : 'You cannot control the computer right now. If asked to open or change something, say kindly that you cannot.',
    aliases.length ? `The user's own shortcut names (use them with open): ${aliases.map((a) => `"${a.name}"`).join(', ')}.` : '',
    routines.length ? `The user's own routines (write the routine name after DO:): ${routines.map((r) => `"${r.name}"`).join(', ')}.` : '',
    user ? `The user's name is ${user}. Use it only now and then.` : '',
    s.assistantStyle.trim() ? `The user's own instructions for how you behave: ${s.assistantStyle.trim()}` : '',
    context ? `What you know right now: ${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Splits the model's reply into the commands it asked for and the sentence to say. A command may also sit in the middle of a line. */
export function parseDoLines(raw: string): { commands: string[]; text: string } {
  const commands: string[] = []
  const spoken: string[] = []
  for (const line of raw.split('\n')) {
    // "DO: open Spotify" on its own line, or "Sure. DO: open Spotify. Opening it now." inside a sentence
    let rest = line
    let m: RegExpMatchArray | null
    while ((m = rest.match(/\bDO:?\s+((?:(?!\bDO\b)[^.\n])+)\.?/))) {
      commands.push(m[1].trim())
      rest = (rest.slice(0, m.index) + ' ' + rest.slice((m.index ?? 0) + m[0].length)).trim()
    }
    if (rest.trim()) spoken.push(rest.trim())
  }
  return { commands: commands.slice(0, 4), text: spoken.join(' ').replace(/\s+/g, ' ').trim() }
}

/** Does what the person said ask for something to be done? A small model sometimes invents a command out of a plain question. */
export const asksForAction = (said: string) =>
  /\b(open|launch|start|run|play|pause|stop|resume|skip|next|previous|mute|unmute|volume|louder|quieter|turn|set|timer|add|remind|search|google|look up|find|go to|lock|sleep|shut|restart|close|switch|show|buka|nyalakan|putar|naikkan|turunkan|tambah|cari|setel)\b/i.test(said)

/**
 * The brain, built-in or Claude: it answers, and any "DO:" lines in its answer are run as commands on the
 * computer. Rejects with a sentence that is fine to show on the island.
 */
export async function converseLocal(
  s: BrainSettings,
  history: ChatMsg[],
  context: string,
  canAct: boolean,
  runCommand: (command: string) => Promise<string>,
): Promise<{ text: string; actions: string[] }> {
  let raw: string
  try {
    const messages: LlmMsg[] = [{ role: 'system', content: localSystemPrompt(s, context, canAct) }, ...history]
    raw = s.assistantEngine === 'claude' ? await chatClaude(s.assistantModel, messages[0].content, history) : await chatLocal(s.assistantLocalModel, messages)
  } catch (e) {
    // Claude's errors are already sentences a person can act on
    throw typeof e === 'string' ? e : 'The built-in brain could not answer. Check Settings > Buddy, or try again'
  }
  const { commands: asked, text } = parseDoLines(raw)
  // commands the person did not ask for are dropped, rather than acted on
  const commands = asksForAction(history[history.length - 1]?.content ?? '') ? asked : []
  const actions: string[] = []
  const problems: string[] = []
  for (const c of canAct ? commands : []) {
    try {
      actions.push(await runCommand(c))
    } catch (e) {
      if (e === 'cancelled') throw e
      problems.push(typeof e === 'string' ? e : 'that did not work')
    }
  }
  let said = text
  if (!said) said = actions.length ? `${actions.join('. ')}.` : problems.length ? '' : "Sorry, I didn't get that. Could you say it again?"
  if (problems.length) said = `${said} But ${problems[0].charAt(0).toLowerCase()}${problems[0].slice(1)}.`.trim()
  return { text: said, actions }
}
