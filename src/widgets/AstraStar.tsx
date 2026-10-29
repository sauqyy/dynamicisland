/** Astra's mark: an eight-point star, four long rays and four short ones. Draws like a lucide icon. */
export function AstraStar({ size = 18, strokeWidth = 1.9 }: { size?: number | string; strokeWidth?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={Number(strokeWidth) * 0.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1.5 14 10 22.5 12 14 14 12 22.5 10 14 1.5 12 10 10Z" fill="currentColor" />
      <path d="M5.2 5.2 9.2 9.2M18.8 5.2 14.8 9.2M5.2 18.8 9.2 14.8M18.8 18.8 14.8 14.8" strokeWidth={Number(strokeWidth) * 0.7} />
    </svg>
  )
}
