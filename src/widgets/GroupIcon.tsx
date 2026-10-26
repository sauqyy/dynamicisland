/** Line icons for the page groups in the dock. They use the current text colour. */
export function GroupIcon({ id, size = 18 }: { id: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (id) {
    case 'home':
      // the island itself: a pill with equalizer bars, and its timer bubble
      return (
        <svg {...common}>
          <rect x="1.8" y="7" width="15.4" height="10" rx="5" />
          <path d="M6 10.5v3M9 9v6M12 11v2" />
          <circle cx="20.2" cy="12" r="1.9" />
        </svg>
      )
    case 'tools':
      // a card with a tick and a line, like a to-do
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="4" />
          <path d="m8.2 10.2 1.9 1.9 3.4-3.6" />
          <path d="M8.5 16h7" />
        </svg>
      )
    case 'files':
      return (
        <svg {...common}>
          <path d="M3.5 8.2V17a2.5 2.5 0 0 0 2.5 2.5h12A2.5 2.5 0 0 0 20.5 17V9.7A2.5 2.5 0 0 0 18 7.2h-5.2L10.9 5H6a2.5 2.5 0 0 0-2.5 2.5Z" />
          <path d="M3.5 10.5h17" />
        </svg>
      )
    case 'social':
      // two people
      return (
        <svg {...common}>
          <circle cx="9" cy="8.5" r="3.2" />
          <path d="M3 19.5c.4-3.2 2.7-5 6-5s5.6 1.8 6 5" />
          <path d="M15.6 5.6a3 3 0 0 1 0 5.8" />
          <path d="M17.5 14.9c1.9.5 3.1 2 3.5 4.6" />
        </svg>
      )
    case 'settings':
      // three sliders
      return (
        <svg {...common}>
          <path d="M4 7h7M15 7h5M4 12h3M11 12h9M4 17h9M17 17h3" />
          <circle cx="13" cy="7" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="15" cy="17" r="2" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
}

/** The settings button in the card header: a cog that turns and lights up on hover (see .gear in App.css). */
export function SettingsCog({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="cog"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.87 5.02 L10.37 1.73 L13.63 1.73 L14.13 5.02 L15.43 5.55 L18.11 3.59 L20.41 5.89 L18.45 8.57 L18.98 9.87 L22.27 10.37 L22.27 13.63 L18.98 14.13 L18.45 15.43 L20.41 18.11 L18.11 20.41 L15.43 18.45 L14.13 18.98 L13.63 22.27 L10.37 22.27 L9.87 18.98 L8.57 18.45 L5.89 20.41 L3.59 18.11 L5.55 15.43 L5.02 14.13 L1.73 13.63 L1.73 10.37 L5.02 9.87 L5.55 8.57 L3.59 5.89 L5.89 3.59 L8.57 5.55 Z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  )
}
