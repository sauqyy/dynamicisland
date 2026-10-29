import { invoke } from '@tauri-apps/api/core'
import { trackOutput } from './audioDevices'
import { IS_TAURI } from './useMedia'
import { loadNeural, splitSentences, synth } from './neuralVoice'

export interface VoicePrefs {
  /** the chosen neural voice, e.g. 'af_heart' */
  voice: string
  /** speaking speed, 1 = normal */
  rate: number
  /** an optional paid cloud voice, even more natural; the local neural voice covers for it if it fails */
  cloud?: { voice: string; model: string } | null
}

interface Handlers {
  /** 0-1, how far through the answer the audio is, so the text can be shown in step */
  onProgress?: (fraction: number) => void
  onStart?: () => void
  onEnd?: () => void
}

/** Text as it should be said: no markdown marks, and line breaks become pauses. */
export function spokenText(t: string) {
  return t
    .replace(/[*_`#>~]+/g, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plays one piece of audio and resolves when it ends. `frac` reports how far through it is. */
function play(url: string, hold: (a: HTMLAudioElement) => void, frac: (f: number) => void, rate = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    // the speaker chosen in Settings applies here too
    trackOutput(audio)
    audio.playbackRate = rate
    hold(audio)
    audio.ontimeupdate = () => audio.duration > 0 && frac(audio.currentTime / audio.duration)
    audio.onended = () => resolve()
    audio.onerror = () => reject(new Error('audio'))
    audio.play().catch(reject)
  })
}

/**
 * Says the text. The voice runs on this computer (no Windows voice is ever used); the answer is made sentence by
 * sentence so the first one starts quickly. The returned function stops it.
 */
export function speak(text: string, prefs: VoicePrefs, h: Handlers = {}) {
  let cancelled = false
  let current: HTMLAudioElement | null = null
  const hold = (a: HTMLAudioElement) => (current = a)
  const clean = spokenText(text)
  let started = false
  const begin = () => {
    if (started) return
    started = true
    h.onStart?.()
  }

  const neural = async () => {
    const sentences = splitSentences(clean)
    const total = Math.max(1, clean.length)
    let before = 0
    // the next sentence is made while this one plays
    let next = synth(sentences[0], prefs.voice, prefs.rate)
    for (let i = 0; i < sentences.length; i++) {
      const blob = await next
      if (cancelled) return
      if (i + 1 < sentences.length) next = synth(sentences[i + 1], prefs.voice, prefs.rate)
      const url = URL.createObjectURL(blob)
      begin()
      const len = sentences[i].length
      const offset = before
      try {
        await play(url, hold, (f) => h.onProgress?.((offset + f * len) / total))
      } finally {
        URL.revokeObjectURL(url)
      }
      before += len + 1
      if (cancelled) return
    }
  }

  const cloud = async () => {
    const b64 = await invoke<string>('assistant_tts', { text: clean, voice: prefs.cloud!.voice, model: prefs.cloud!.model })
    if (cancelled) return
    begin()
    await play(`data:audio/mpeg;base64,${b64}`, hold, (f) => h.onProgress?.(f), Math.max(0.7, Math.min(1.5, prefs.rate)))
  }

  void (async () => {
    try {
      if (prefs.cloud && IS_TAURI) {
        try {
          await cloud()
        } catch (e) {
          // no key, no internet or no credit: the local voice takes over rather than going quiet
          if (!cancelled && !started) await neural()
          else if (!cancelled) throw e
        }
      } else {
        await neural()
      }
    } catch (e) {
      console.warn('voice failed', e)
    } finally {
      if (!cancelled) h.onEnd?.()
    }
  })()

  return () => {
    cancelled = true
    current?.pause()
    current = null
  }
}

/** Says a short sample, and returns what went wrong if the voice could not be used. */
export async function sampleVoice(text: string, prefs: VoicePrefs): Promise<string | null> {
  try {
    if (prefs.cloud && IS_TAURI) {
      const b64 = await invoke<string>('assistant_tts', { text, voice: prefs.cloud.voice, model: prefs.cloud.model })
      await play(`data:audio/mpeg;base64,${b64}`, () => {}, () => {})
    } else {
      await loadNeural()
      const url = URL.createObjectURL(await synth(text, prefs.voice, prefs.rate))
      await play(url, () => {}, () => {})
      URL.revokeObjectURL(url)
    }
    return null
  } catch (e) {
    return typeof e === 'string' ? e : 'The voice could not be played'
  }
}
