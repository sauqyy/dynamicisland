/** Line icons for the alerts. Alerts are raised with an emoji; known ones are drawn as icons, anything else shows the emoji. */
const PATHS: Record<string, string> = {
  bolt: 'M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5z',
  battery: 'M5 7h11.5A2.5 2.5 0 0 1 19 9.5v5a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 14.5v-5A2.5 2.5 0 0 1 5 7zM22 10.5v3',
  batteryLow: 'M5 7h11.5A2.5 2.5 0 0 1 19 9.5v5a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 14.5v-5A2.5 2.5 0 0 1 5 7zM22 10.5v3M6 10.5v3',
  volume: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  volumeLow: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16 9a4.5 4.5 0 0 1 0 6',
  mute: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  timer: 'M12 6a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 10v3.5l2.3 2.3M9.5 2.5h5',
  update: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  warn: 'M12 3.5 2.5 20h19zM12 10v4.5M12 17.5v.01',
  message: 'M4.5 5.5h15v10.5H9.5l-5 4z',
  copy: 'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  camera: 'M3 7.5h3l1.5-2h9l1.5 2h3v11H3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3',
  keys: 'M3.5 6.5h17v11h-17zM7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8',
  next: 'M5 6l8 6-8 6zM15 6l4 6-4 6',
  prev: 'M19 6l-8 6 8 6zM9 6l-4 6 4 6',
}

const BY_EMOJI: Record<string, keyof typeof PATHS> = {
  '⚡': 'bolt',
  '🔋': 'battery',
  '🪫': 'batteryLow',
  '🔊': 'volume',
  '🔉': 'volumeLow',
  '🔇': 'mute',
  '🔆': 'sun',
  '🔅': 'sun',
  '⏰': 'timer',
  '🎯': 'timer',
  '☕': 'timer',
  '⬆️': 'update',
  '⬇️': 'update',
  '⚠️': 'warn',
  '💬': 'message',
  '📋': 'copy',
  '📷': 'camera',
  '🎙️': 'mic',
  '🔠': 'keys',
  '🔡': 'keys',
  '🔢': 'keys',
  '⏭': 'next',
  '⏮': 'prev',
}

/** Colour of an alert by what it is about (status colours from tokens.css). */
const TONE: Record<string, string> = {
  '⚡': 'var(--charge)',
  '🪫': 'var(--warn)',
  '⚠️': 'var(--danger)',
  '⬆️': 'var(--info)',
  '⬇️': 'var(--info)',
  '📷': 'var(--warn)',
  '🎙️': 'var(--warn)',
  '📋': 'var(--charge)',
  '⏰': 'var(--accent)',
  '🎯': 'var(--accent)',
  '☕': 'var(--accent)',
}

export const alertTone = (icon: string) => TONE[icon] ?? 'var(--text-1)'

export function AlertIcon({ icon, size = 15 }: { icon: string; size?: number }) {
  const name = BY_EMOJI[icon]
  if (!name) return <span className="al-emoji">{icon}</span>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}
