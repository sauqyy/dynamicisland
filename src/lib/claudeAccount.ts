import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

/**
 * Claude through your own Claude account, no API key: Claude Code (it comes with the Claude app) does the talking
 * and signs in the official way, with your browser, once.
 */
export interface ClaudeAccount {
  /** checking: not looked yet / looking · missing: Claude Code not found · out: not signed in · signing: waiting for the browser · in: ready */
  state: 'checking' | 'missing' | 'out' | 'signing' | 'in'
  /** why the last sign-in did not work */
  error: string
}

let account: ClaudeAccount = { state: IS_TAURI ? 'checking' : 'missing', error: '' }
let checked = false
const subs = new Set<() => void>()
const set = (s: Partial<ClaudeAccount>) => {
  account = { ...account, ...s }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
export const useClaudeAccount = () => useSyncExternalStore(subscribe, () => account)
export const getClaudeAccount = () => account

/** Asks Claude Code whether it is installed and signed in. */
export async function refreshClaude(): Promise<ClaudeAccount> {
  if (!IS_TAURI) return account
  set({ state: 'checking' })
  const s = await invoke<{ found: boolean; loggedIn: boolean }>('claude_status').catch(() => ({ found: false, loggedIn: false }))
  checked = true
  set({ state: !s.found ? 'missing' : s.loggedIn ? 'in' : 'out' })
  return account
}

/** The status, looked up once if nobody has yet. */
export async function claudeReady(): Promise<ClaudeAccount> {
  return checked ? account : refreshClaude()
}

/** Opens the browser to sign in, and waits until it is done. */
export async function signInClaude() {
  set({ state: 'signing', error: '' })
  let problem = ''
  try {
    await invoke('claude_login')
  } catch (e) {
    problem = typeof e === 'string' ? e : 'The sign-in did not finish'
  }
  await refreshClaude()
  if (problem && account.state !== 'in') set({ error: problem })
}

export async function signOutClaude() {
  await invoke('claude_logout').catch(() => {})
  await refreshClaude()
}

/** haiku, sonnet or opus, from whatever the setting holds */
export const claudeAlias = (model: string) => (/opus/i.test(model) ? 'opus' : /sonnet/i.test(model) ? 'sonnet' : 'haiku')

export interface ClaudeMsg {
  role: 'user' | 'assistant'
  content: string
}

/** One answer from Claude, signed in as you. Rejects with a sentence that is fine to show on the island. */
export const chatClaude = (model: string, system: string, messages: ClaudeMsg[]) => invoke<string>('claude_chat', { model: claudeAlias(model), system, messages })
