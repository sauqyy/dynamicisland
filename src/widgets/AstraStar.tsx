/** Astra's mark: a crescent moon with a four-point star and a speck of dust. Draws like a lucide icon. */
export function AstraStar({ size = 18, strokeWidth = 1.9 }: { size?: number | string; strokeWidth?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19.5 14.5A8.5 8.5 0 0 1 9.5 4.5 8.5 8.5 0 1 0 19.5 14.5Z" />
      <path d="M17 3C17.2 5 17.9 5.8 20 6 17.9 6.2 17.2 7 17 9 16.8 7 16.1 6.2 14 6 16.1 5.8 16.8 5 17 3Z" fill="currentColor" strokeWidth="1" />
      <circle cx="21" cy="11" r=".9" fill="currentColor" stroke="none" />
    </svg>
  )
}
