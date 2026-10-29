/** How a picked photo sits in the square: zoom ≥ 1 over a cover fit, offsets as a fraction of the square's side. */
export interface Crop {
  zoom: number
  x: number
  y: number
}

export const NO_CROP: Crop = { zoom: 1, x: 0, y: 0 }
export const MAX_ZOOM = 4

/** Keeps the photo covering the whole square, so no blank edge can show. */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom))
  const side = Math.min(w, h)
  const maxX = ((w / side) * zoom - 1) / 2
  const maxY = ((h / side) * zoom - 1) / 2
  return { zoom, x: Math.min(maxX, Math.max(-maxX, c.x)), y: Math.min(maxY, Math.max(-maxY, c.y)) }
}

/** Where the photo is drawn inside a square of `size` px for a crop. */
export function cropRect(c: Crop, w: number, h: number, size: number) {
  const scale = (size / Math.min(w, h)) * c.zoom
  const width = w * scale
  const height = h * scale
  return { left: (size - width) / 2 + c.x * size, top: (size - height) / 2 + c.y * size, width, height }
}

/** `profiles.avatar_url` is capped at this many characters (supabase/schema.sql). */
const MAX_PHOTO_CHARS = 40_000

/**
 * Renders a photo with a crop to a square JPEG (data: URL) that is cheap to store and send, but big
 * enough to look sharp when someone opens it full size. Busy photos get a lower quality to fit the cap.
 */
export function cropPhoto(bitmap: ImageBitmap, crop: Crop, size = 256): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the image')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, size, size)
  const r = cropRect(crop, bitmap.width, bitmap.height, size)
  ctx.drawImage(bitmap, r.left, r.top, r.width, r.height)
  for (const quality of [0.82, 0.7, 0.58]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_PHOTO_CHARS) return url
  }
  return size > 128 ? cropPhoto(bitmap, crop, 128) : canvas.toDataURL('image/jpeg', 0.5)
}
