import path from 'node:path'
import { readFile } from 'node:fs/promises'
import multer from 'multer'
import { ImageError, removeImage, saveImage, thumbName } from './inventory/images.js'

/** Built-in cartoon avatars; the drawings live in the client (src/components/user-avatar.tsx). */
export const AVATAR_PRESETS = ['helmet-yellow', 'engineer-white', 'girl-yellow', 'firefighter', 'rubber-bale', 'medic', 'inspector', 'technician']

const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Profile picture endpoints: choose a preset, upload a photo, remove it, and serve photos to signed-in users. */
export function registerAvatarRoutes(app, { db, requireAuth, uploadDir, safeUser }) {
  const dir = path.join(uploadDir, 'avatars')
  const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single('image')

  const current = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  const respond = (req, res) => { const user = safeUser(current(req.session.user.id)); req.session.user = user; res.json({ user }) }
  const fail = (res, message) => res.status(400).json({ error: message })
  /** Drops the previous photo (if the stored avatar was one) once the new value is saved. */
  const discard = (previous) => previous?.startsWith('photo:') ? removeImage(dir, previous.slice(6)) : undefined

  app.put('/api/auth/avatar', requireAuth, async (req, res) => {
    const preset = String(req.body?.preset ?? '')
    if (!AVATAR_PRESETS.includes(preset)) return fail(res, 'ไม่พบรูปโปรไฟล์ที่เลือก')
    const previous = current(req.session.user.id)?.avatar
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(`preset:${preset}`, req.session.user.id)
    await discard(previous)
    respond(req, res)
  })

  app.post('/api/auth/avatar', requireAuth, (req, res, next) => {
    uploader(req, res, async (uploadError) => {
      try {
        if (uploadError) return fail(res, uploadError.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์รูปใหญ่เกิน 4 MB' : 'อัปโหลดรูปไม่สำเร็จ')
        if (!req.file) return fail(res, 'กรุณาเลือกรูปภาพ')
        if (!ALLOWED.has(req.file.mimetype)) return fail(res, 'รองรับไฟล์ JPG, PNG หรือ WebP เท่านั้น')
        let saved
        try { saved = await saveImage(req.file.buffer, dir) } catch (error) { if (error instanceof ImageError) return fail(res, error.message); throw error }
        const previous = current(req.session.user.id)?.avatar
        db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(`photo:${saved.stored}`, req.session.user.id)
        await discard(previous)
        respond(req, res)
      } catch (error) { next(error) }
    })
  })

  app.delete('/api/auth/avatar', requireAuth, async (req, res) => {
    const previous = current(req.session.user.id)?.avatar
    db.prepare("UPDATE users SET avatar = '' WHERE id = ?").run(req.session.user.id)
    await discard(previous)
    respond(req, res)
  })

  // Any signed-in user may see another user's picture (names and pictures show up in shared lists).
  app.get('/api/users/:id/avatar', requireAuth, async (req, res) => {
    const avatar = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.params.id)?.avatar ?? ''
    if (!avatar.startsWith('photo:')) return res.status(404).json({ error: 'ไม่พบรูปโปรไฟล์' })
    try {
      const file = await readFile(path.join(dir, thumbName(path.basename(avatar.slice(6)))))
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'private, max-age=86400')
      res.send(file)
    } catch { res.status(404).json({ error: 'ไม่พบรูปโปรไฟล์' }) }
  })
}
