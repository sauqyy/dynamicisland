import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, Thermometer, type LucideIcon } from 'lucide-react'

/** A line icon for a WMO weather code (Open-Meteo); clear and mostly clear skies show a moon at night. */
export function weatherIcon(code: number, night = false): LucideIcon {
  if (code === 0) return night ? Moon : Sun
  if (code === 1 || code === 2) return night ? CloudMoon : CloudSun
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Thermometer
}

export function WeatherIcon({ code, night, size = 16 }: { code: number; night?: boolean; size?: number }) {
  const Icon = weatherIcon(code, night)
  return <Icon size={size} strokeWidth={1.9} aria-hidden />
}

/** Night for the sky icon: before 6:00 or from 19:00. */
export const isNight = (hour: number) => hour < 6 || hour >= 19
