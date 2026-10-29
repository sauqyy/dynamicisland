/** `profiles.avatar_url` is capped at this many characters (supabase/schema.sql). */
const MAX_PHOTO_CHARS = 40_000

/**
 * Centre-crops an image file to a square JPEG (data: URL) that is cheap to store and send, but big
 * enough to look sharp when someone opens it full size. Busy photos get a lower quality to fit the cap.
 */
export async function squarePhoto(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the image')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  for (const quality of [0.82, 0.7, 0.58]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_PHOTO_CHARS) return url
  }
  return squarePhoto(file, 128)
}
