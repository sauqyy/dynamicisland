import {
  AlarmClock,
  Award,
  BatteryFull,
  BatteryLow,
  BookOpen,
  CalendarClock,
  Camera,
  CircleArrowUp,
  CircleCheck,
  ClipboardCheck,
  Coffee,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Hourglass,
  Keyboard,
  Megaphone,
  MessageCircle,
  Mic,
  Music2,
  PersonStanding,
  Phone,
  SkipBack,
  SkipForward,
  StickyNote,
  Sun,
  SunDim,
  Target,
  Timer,
  TriangleAlert,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { UiLogo } from '../widgets/UiLogo'
// written out, not imported, so the bundler can drop the logo from the regular build
// also the browser dev server, for the SCELE demo (see campus.ts)
const CAMPUS = (import.meta.env.VITE_CAMPUS === '1' || (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window) && !location.search.includes('nocampus')))

/** Alerts are raised with an emoji; known ones are drawn as line icons, anything else shows the emoji. */
const BY_EMOJI: Record<string, LucideIcon> = {
  '⚡': Zap,
  '🔋': BatteryFull,
  '🪫': BatteryLow,
  '🔊': Volume2,
  '🔉': Volume1,
  '🔇': VolumeX,
  '🔆': Sun,
  '🔅': SunDim,
  '⏰': AlarmClock,
  '⏳': Hourglass,
  '🍅': Timer,
  '🎯': Target,
  '☕': Coffee,
  '👀': Eye,
  '🧘': PersonStanding,
  '🎓': GraduationCap,
  '📚': BookOpen,
  '⬆️': CircleArrowUp,
  '⬇️': Download,
  '⚠️': TriangleAlert,
  '💬': MessageCircle,
  '📋': ClipboardCheck,
  '📝': StickyNote,
  '📷': Camera,
  '🎙️': Mic,
  '📞': Phone,
  '🎵': Music2,
  '👥': Users,
  '🔠': Keyboard,
  '🔡': Keyboard,
  '🔢': Keyboard,
  '⏭': SkipForward,
  '⏮': SkipBack,
  '📅': CalendarClock,
  '📣': Megaphone,
  '📄': FileText,
  '✅': CircleCheck,
  '🏅': Award,
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
  '📞': 'var(--charge)',
  '⏰': 'var(--accent)',
  '⏳': 'var(--accent)',
  '🍅': 'var(--accent)',
  '🎯': 'var(--accent)',
  '☕': 'var(--accent)',
  '👀': 'var(--info)',
  '🧘': 'var(--charge)',
  '🎓': 'var(--accent)',
  '📚': 'var(--accent)',
  '📣': 'var(--info)',
  '📄': 'var(--info)',
  '✅': 'var(--charge)',
  '🏅': 'var(--accent)',
}

export const alertTone = (icon: string) => TONE[icon] ?? 'var(--text-1)'

export function AlertIcon({ icon, size = 15 }: { icon: string; size?: number }) {
  // a class about to start is marked with Universitas Indonesia's makara
  if (CAMPUS && icon === '🎓') return <UiLogo size={size + 1} />
  const Icon = BY_EMOJI[icon]
  if (!Icon) return <span className="al-emoji">{icon}</span>
  return <Icon size={size} strokeWidth={2} aria-hidden />
}
