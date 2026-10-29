/** Astra's mark: a sharp four-point guiding star with a small companion star. Draws like a lucide icon. */
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
      <path d="M10.5 4 12.4 11.6 20 13.5 12.4 15.4 10.5 23 8.6 15.4 1 13.5 8.6 11.6Z" />
      <circle cx="19" cy="5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
