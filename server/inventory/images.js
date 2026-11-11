import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const LIMIT_PIXELS = 40_000_000

export class ImageError extends Error {
  constructor(message) {
    super(message)
    this.status = 400
  }
}

export const thumbName = (stored) => stored.replace(/\.jpg$/, '.thumb.jpg')

/**
 * Validates and stores an uploaded photo as a 1280px JPEG plus a 320px thumbnail.
 * Only real JPEG/PNG/WebP content is accepted (the file is decoded, not trusted by name or mime type).
 */
export async function saveImage(buffer, dir) {
  let format
  try { format = (await sharp(buffer, { failOn: 'error', limitInputPixels: LIMIT_PIXELS }).metadata()).format } catch { throw new ImageError('ไฟล์รูปภาพไม่ถูกต้อง กรุณาใช้ JPG, PNG หรือ WebP') }
  if (!['jpeg', 'png', 'webp'].includes(format)) throw new ImageError('ไฟล์รูปภาพไม่ถูกต้อง กรุณาใช้ JPG, PNG หรือ WebP')
  const id = randomUUID()
  const stored = `${id}.jpg`
  const base = sharp(buffer, { failOn: 'error', limitInputPixels: LIMIT_PIXELS }).rotate()
  const full = await base.clone().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer()
  const small = await base.clone().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, stored), full, { flag: 'wx' })
  await writeFile(path.join(dir, thumbName(stored)), small, { flag: 'wx' })
  return { stored, thumb: thumbName(stored) }
}

/** Removes both files of a stored image; missing files are fine. */
export async function removeImage(dir, stored) {
  if (!stored) return
  const safe = path.basename(stored)
  await Promise.allSettled([unlink(path.join(dir, safe)), unlink(path.join(dir, thumbName(safe)))])
}
