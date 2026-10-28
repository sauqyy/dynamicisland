import makara from '../assets/ui-makara.png'

/** UI yellow, for when the logo is shown in its own colour. */
export const UI_YELLOW = '#fbc707'

/**
 * Universitas Indonesia's makara, drawn as a mask so it takes the current text colour like the
 * line icons (or `color`, e.g. UI_YELLOW).
 */
export function UiLogo({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <span
      className="ui-logo"
      aria-hidden
      style={{ width: size * 0.92, height: size, background: color ?? 'currentColor', maskImage: `url(${makara})`, WebkitMaskImage: `url(${makara})` }}
    />
  )
}
