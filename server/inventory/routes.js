import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ImageError, removeImage, saveImage, thumbName } from './images.js'
import ExcelJS from 'exceljs'
import { StockError, createStockService } from './stock.js'
import { createCountService } from './counts.js'

const TYPES = ['ppe', 'medicine']
const FORBIDDEN = 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้'

/** All /api/inventory endpoints. Reads need admin or storekeeper; catalog and warehouse writes need admin. */
export function registerInventoryRoutes(app, { db, requireAuth, requireAdmin, addAudit, nowIso, uploadDir }) {
  const router = express.Router()
  const imageDir = path.join(uploadDir, 'inventory')

  const requireStockStaff = (req, res, next) => requireAuth(req, res, () => {
    const { role } = req.session.user
    if (role !== 'admin' && role !== 'storekeeper') return res.status(403).json({ error: FORBIDDEN })
    next()
  })
  router.use(requireStockStaff)

  const bad = (res, message, status = 400) => res.status(status).json({ error: message })
  const text = (value, max = 120) => String(value ?? '').trim().slice(0, max)
  const wholeNumber = (value, fallback = 0) => (value === undefined || value === null || value === '' ? fallback : Number(value))
  const flag = (value, fallback) => (value === undefined ? fallback : value === true || value === 1 || value === '1' || value === 'true')
  const escapeLike = (value) => value.replace(/[!%_]/g, (char) => `!${char}`)

  function inTx(fn) {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }

  const hasMovements = {
    variant: (id) => Boolean(db.prepare('SELECT 1 FROM stock_movements WHERE variant_id = ? LIMIT 1').get(id)),
    item: (id) => Boolean(db.prepare('SELECT 1 FROM stock_movements WHERE variant_id IN (SELECT id FROM item_variants WHERE item_id = ?) LIMIT 1').get(id)),
    warehouse: (id) => Boolean(db.prepare('SELECT 1 FROM stock_movements WHERE warehouse_id = ? LIMIT 1').get(id))
      || Boolean(db.prepare('SELECT 1 FROM stock_counts WHERE warehouse_id = ? LIMIT 1').get(id)),
  }

  // ---- categories ----
  const categoryDto = (row) => ({ id: row.id, name: row.name, type: row.type, sortOrder: row.sort_order, itemCount: row.item_count ?? 0 })
  const loadCategory = (id) => db.prepare('SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count FROM item_categories c WHERE c.id = ?').get(id)

  router.get('/categories', (_req, res) => {
    const rows = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count FROM item_categories c ORDER BY c.type, c.sort_order, c.name COLLATE NOCASE').all()
    res.json({ categories: rows.map(categoryDto) })
  })

  router.post('/categories', requireAdmin, (req, res) => {
    const name = text(req.body?.name)
    const type = String(req.body?.type || '')
    const sortOrder = wholeNumber(req.body?.sortOrder)
    if (!name) return bad(res, 'กรุณาระบุชื่อหมวด')
    if (!TYPES.includes(type)) return bad(res, 'ประเภทสินค้าไม่ถูกต้อง')
    if (!Number.isInteger(sortOrder)) return bad(res, 'ลำดับต้องเป็นจำนวนเต็ม')
    const id = randomUUID()
    db.prepare('INSERT INTO item_categories (id, name, type, sort_order) VALUES (?, ?, ?, ?)').run(id, name, type, sortOrder)
    addAudit(req.session.user.id, 'เพิ่มหมวดสินค้า', 'inventory_category', id, { name, type })
    res.status(201).json({ category: categoryDto(loadCategory(id)) })
  })

  router.patch('/categories/:id', requireAdmin, (req, res) => {
    const existing = loadCategory(req.params.id)
    if (!existing) return bad(res, 'ไม่พบหมวดสินค้า', 404)
    const name = text(req.body?.name ?? existing.name)
    const sortOrder = wholeNumber(req.body?.sortOrder, existing.sort_order)
    if (!name) return bad(res, 'กรุณาระบุชื่อหมวด')
    if (!Number.isInteger(sortOrder)) return bad(res, 'ลำดับต้องเป็นจำนวนเต็ม')
    db.prepare('UPDATE item_categories SET name = ?, sort_order = ? WHERE id = ?').run(name, sortOrder, existing.id)
    addAudit(req.session.user.id, 'แก้ไขหมวดสินค้า', 'inventory_category', existing.id, { name })
    res.json({ category: categoryDto(loadCategory(existing.id)) })
  })

  router.delete('/categories/:id', requireAdmin, (req, res) => {
    const existing = loadCategory(req.params.id)
    if (!existing) return bad(res, 'ไม่พบหมวดสินค้า', 404)
    if (existing.item_count > 0) return bad(res, 'ยังมีสินค้าอยู่ในหมวดนี้ กรุณาย้ายหรือลบสินค้าก่อน', 409)
    db.prepare('DELETE FROM item_categories WHERE id = ?').run(existing.id)
    addAudit(req.session.user.id, 'ลบหมวดสินค้า', 'inventory_category', existing.id, { name: existing.name })
    res.json({ ok: true })
  })

  // ---- items and variants ----
  const variantDto = (row) => ({ id: row.id, label: row.label, isActive: Boolean(row.is_active) })
  function itemDto(row) {
    const variants = db.prepare('SELECT * FROM item_variants WHERE item_id = ? ORDER BY rowid').all(row.id).map(variantDto)
    return {
      id: row.id, sku: row.sku, name: row.name, type: row.type, categoryId: row.category_id, categoryName: row.category_name || '',
      unit: row.unit, image: row.image, minStock: row.min_stock, trackLot: Boolean(row.track_lot), trackExpiry: Boolean(row.track_expiry),
      isActive: Boolean(row.is_active), variants,
      imageUrl: row.image ? `/api/inventory/items/${row.id}/image?v=${row.image.slice(0, 8)}` : null,
    }
  }
  const loadItem = (id) => db.prepare('SELECT i.*, c.name AS category_name FROM items i LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.id = ?').get(id)
  const skuTaken = (sku, exceptId = '') => Boolean(db.prepare('SELECT 1 FROM items WHERE UPPER(sku) = UPPER(?) AND id != ?').get(sku, exceptId))

  router.get('/items', (req, res) => {
    const where = []
    const params = []
    const type = String(req.query.type || '')
    if (TYPES.includes(type)) { where.push('i.type = ?'); params.push(type) }
    if (req.query.active === '1' || req.query.active === '0') { where.push('i.is_active = ?'); params.push(Number(req.query.active)) }
    const q = text(req.query.q, 60)
    if (q) { where.push("(i.name LIKE ? ESCAPE '!' OR i.sku LIKE ? ESCAPE '!')"); params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`) }
    const rows = db.prepare(`SELECT i.*, c.name AS category_name FROM items i LEFT JOIN item_categories c ON c.id = i.category_id
                             ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.type, i.name COLLATE NOCASE`).all(...params)
    res.json({ items: rows.map(itemDto) })
  })

  function checkCategory(categoryId, type) {
    if (!categoryId) return ''
    const category = db.prepare('SELECT type FROM item_categories WHERE id = ?').get(categoryId)
    return category && category.type === type ? '' : 'หมวดสินค้าไม่ถูกต้องหรือไม่ตรงกับประเภทสินค้า'
  }

  router.post('/items', requireAdmin, (req, res) => {
    const body = req.body || {}
    const sku = text(body.sku, 40)
    const name = text(body.name)
    const type = String(body.type || '')
    const unit = text(body.unit, 30)
    const minStock = wholeNumber(body.minStock)
    const categoryId = String(body.categoryId || '')
    if (!sku || !name || !unit) return bad(res, 'กรุณาระบุรหัสสินค้า ชื่อ และหน่วยนับ')
    if (!TYPES.includes(type)) return bad(res, 'ประเภทสินค้าไม่ถูกต้อง')
    if (!Number.isInteger(minStock) || minStock < 0) return bad(res, 'จุดสั่งซื้อซ้ำต้องเป็นจำนวนเต็มตั้งแต่ 0')
    const categoryError = checkCategory(categoryId, type)
    if (categoryError) return bad(res, categoryError)
    const labels = Array.isArray(body.variants) && body.variants.length ? body.variants.map((label) => text(label, 40)) : ['']
    if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) return bad(res, 'ชื่อตัวเลือกซ้ำกัน')
    if (labels.length > 1 && labels.some((label) => !label)) return bad(res, 'ตัวเลือกต้องมีชื่อ')
    if (skuTaken(sku)) return bad(res, 'รหัสสินค้านี้มีอยู่แล้ว', 409)
    const trackLot = type === 'medicine' ? true : flag(body.trackLot, false)
    const trackExpiry = type === 'medicine' ? true : flag(body.trackExpiry, false)
    const id = randomUUID()
    inTx(() => {
      db.prepare(`INSERT INTO items (id, sku, name, type, category_id, unit, min_stock, track_lot, track_expiry, is_active, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(id, sku, name, type, categoryId, unit, minStock, trackLot ? 1 : 0, trackExpiry ? 1 : 0, nowIso())
      for (const label of labels) db.prepare('INSERT INTO item_variants (id, item_id, label, is_active) VALUES (?, ?, ?, 1)').run(randomUUID(), id, label)
    })
    addAudit(req.session.user.id, 'เพิ่มสินค้า', 'inventory_item', id, { sku, name, type })
    res.status(201).json({ item: itemDto(loadItem(id)) })
  })

  router.patch('/items/:id', requireAdmin, (req, res) => {
    const existing = loadItem(req.params.id)
    if (!existing) return bad(res, 'ไม่พบสินค้า', 404)
    const body = req.body || {}
    const name = text(body.name ?? existing.name)
    const unit = text(body.unit ?? existing.unit, 30)
    const minStock = wholeNumber(body.minStock, existing.min_stock)
    const categoryId = body.categoryId === undefined ? existing.category_id : String(body.categoryId || '')
    if (!name || !unit) return bad(res, 'กรุณาระบุชื่อและหน่วยนับ')
    if (!Number.isInteger(minStock) || minStock < 0) return bad(res, 'จุดสั่งซื้อซ้ำต้องเป็นจำนวนเต็มตั้งแต่ 0')
    const categoryError = checkCategory(categoryId, existing.type)
    if (categoryError) return bad(res, categoryError)
    const trackLot = existing.type === 'medicine' ? true : flag(body.trackLot, Boolean(existing.track_lot))
    const trackExpiry = existing.type === 'medicine' ? true : flag(body.trackExpiry, Boolean(existing.track_expiry))
    if ((trackLot !== Boolean(existing.track_lot) || trackExpiry !== Boolean(existing.track_expiry)) && hasMovements.item(existing.id)) {
      return bad(res, 'เปลี่ยนการติดตามล็อต/วันหมดอายุไม่ได้ เพราะสินค้านี้มีประวัติสต็อกแล้ว', 409)
    }
    const isActive = flag(body.isActive, Boolean(existing.is_active))
    db.prepare('UPDATE items SET name = ?, unit = ?, min_stock = ?, category_id = ?, track_lot = ?, track_expiry = ?, is_active = ? WHERE id = ?')
      .run(name, unit, minStock, categoryId, trackLot ? 1 : 0, trackExpiry ? 1 : 0, isActive ? 1 : 0, existing.id)
    addAudit(req.session.user.id, 'แก้ไขสินค้า', 'inventory_item', existing.id, { sku: existing.sku, name })
    res.json({ item: itemDto(loadItem(existing.id)) })
  })

  router.delete('/items/:id', requireAdmin, async (req, res) => {
    const existing = loadItem(req.params.id)
    if (!existing) return bad(res, 'ไม่พบสินค้า', 404)
    if (hasMovements.item(existing.id)) return bad(res, 'สินค้านี้มีประวัติสต็อกแล้ว ลบไม่ได้ กรุณาปิดใช้งานแทน', 409)
    inTx(() => {
      db.prepare('DELETE FROM item_variants WHERE item_id = ?').run(existing.id)
      db.prepare('DELETE FROM items WHERE id = ?').run(existing.id)
    })
    await removeImage(imageDir, existing.image)
    addAudit(req.session.user.id, 'ลบสินค้า', 'inventory_item', existing.id, { sku: existing.sku, name: existing.name })
    res.json({ ok: true })
  })

  const labelTaken = (itemId, label, exceptId = '') => Boolean(db.prepare('SELECT 1 FROM item_variants WHERE item_id = ? AND LOWER(label) = LOWER(?) AND id != ?').get(itemId, label, exceptId))

  router.post('/items/:id/variants', requireAdmin, (req, res) => {
    const item = loadItem(req.params.id)
    if (!item) return bad(res, 'ไม่พบสินค้า', 404)
    const label = text(req.body?.label, 40)
    if (!label) return bad(res, 'กรุณาระบุชื่อตัวเลือก')
    if (labelTaken(item.id, label)) return bad(res, 'ชื่อตัวเลือกนี้มีอยู่แล้ว', 409)
    const id = randomUUID()
    db.prepare('INSERT INTO item_variants (id, item_id, label, is_active) VALUES (?, ?, ?, 1)').run(id, item.id, label)
    addAudit(req.session.user.id, 'เพิ่มตัวเลือกสินค้า', 'inventory_item', item.id, { label })
    res.status(201).json({ variant: variantDto(db.prepare('SELECT * FROM item_variants WHERE id = ?').get(id)) })
  })

  router.patch('/variants/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM item_variants WHERE id = ?').get(req.params.id)
    if (!existing) return bad(res, 'ไม่พบตัวเลือกสินค้า', 404)
    const label = text(req.body?.label ?? existing.label, 40)
    if (!label && db.prepare('SELECT COUNT(*) AS n FROM item_variants WHERE item_id = ?').get(existing.item_id).n > 1) return bad(res, 'กรุณาระบุชื่อตัวเลือก')
    if (labelTaken(existing.item_id, label, existing.id)) return bad(res, 'ชื่อตัวเลือกนี้มีอยู่แล้ว', 409)
    const isActive = flag(req.body?.isActive, Boolean(existing.is_active))
    db.prepare('UPDATE item_variants SET label = ?, is_active = ? WHERE id = ?').run(label, isActive ? 1 : 0, existing.id)
    addAudit(req.session.user.id, 'แก้ไขตัวเลือกสินค้า', 'inventory_item', existing.item_id, { label })
    res.json({ variant: variantDto(db.prepare('SELECT * FROM item_variants WHERE id = ?').get(existing.id)) })
  })

  router.delete('/variants/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM item_variants WHERE id = ?').get(req.params.id)
    if (!existing) return bad(res, 'ไม่พบตัวเลือกสินค้า', 404)
    if (hasMovements.variant(existing.id)) return bad(res, 'ตัวเลือกนี้มีประวัติสต็อกแล้ว ลบไม่ได้ กรุณาปิดใช้งานแทน', 409)
    if (db.prepare('SELECT COUNT(*) AS n FROM item_variants WHERE item_id = ?').get(existing.item_id).n <= 1) return bad(res, 'สินค้าต้องมีตัวเลือกอย่างน้อย 1 รายการ', 409)
    db.prepare('DELETE FROM item_variants WHERE id = ?').run(existing.id)
    addAudit(req.session.user.id, 'ลบตัวเลือกสินค้า', 'inventory_item', existing.item_id, { label: existing.label })
    res.json({ ok: true })
  })

  // ---- warehouses ----
  function warehouseDto(row) {
    const staff = db.prepare(`SELECT s.user_id, u.display_name FROM warehouse_staff s JOIN users u ON u.id = s.user_id WHERE s.warehouse_id = ? ORDER BY u.display_name COLLATE NOCASE`).all(row.id)
    return { id: row.id, code: row.code, name: row.name, isActive: Boolean(row.is_active), staff: staff.map((member) => ({ userId: member.user_id, name: member.display_name })) }
  }
  const loadWarehouse = (id) => db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id)
  const codeTaken = (code, exceptId = '') => Boolean(db.prepare('SELECT 1 FROM warehouses WHERE UPPER(code) = UPPER(?) AND id != ?').get(code, exceptId))

  router.get('/warehouses', (req, res) => {
    const user = req.session.user
    const rows = user.role === 'admin'
      ? db.prepare('SELECT * FROM warehouses ORDER BY code COLLATE NOCASE').all()
      : db.prepare('SELECT w.* FROM warehouses w JOIN warehouse_staff s ON s.warehouse_id = w.id WHERE s.user_id = ? ORDER BY w.code COLLATE NOCASE').all(user.id)
    res.json({ warehouses: rows.map(warehouseDto) })
  })

  router.post('/warehouses', requireAdmin, (req, res) => {
    const code = text(req.body?.code, 20).toUpperCase()
    const name = text(req.body?.name)
    if (!code || !name) return bad(res, 'กรุณาระบุรหัสและชื่อคลัง')
    if (codeTaken(code)) return bad(res, 'รหัสคลังนี้มีอยู่แล้ว', 409)
    const id = randomUUID()
    db.prepare('INSERT INTO warehouses (id, code, name, is_active) VALUES (?, ?, ?, 1)').run(id, code, name)
    addAudit(req.session.user.id, 'เพิ่มคลัง', 'inventory_warehouse', id, { code, name })
    res.status(201).json({ warehouse: warehouseDto(loadWarehouse(id)) })
  })

  router.patch('/warehouses/:id', requireAdmin, (req, res) => {
    const existing = loadWarehouse(req.params.id)
    if (!existing) return bad(res, 'ไม่พบคลัง', 404)
    const code = text(req.body?.code ?? existing.code, 20).toUpperCase()
    const name = text(req.body?.name ?? existing.name)
    if (!code || !name) return bad(res, 'กรุณาระบุรหัสและชื่อคลัง')
    if (codeTaken(code, existing.id)) return bad(res, 'รหัสคลังนี้มีอยู่แล้ว', 409)
    const isActive = flag(req.body?.isActive, Boolean(existing.is_active))
    db.prepare('UPDATE warehouses SET code = ?, name = ?, is_active = ? WHERE id = ?').run(code, name, isActive ? 1 : 0, existing.id)
    addAudit(req.session.user.id, 'แก้ไขคลัง', 'inventory_warehouse', existing.id, { code, name })
    res.json({ warehouse: warehouseDto(loadWarehouse(existing.id)) })
  })

  router.delete('/warehouses/:id', requireAdmin, (req, res) => {
    const existing = loadWarehouse(req.params.id)
    if (!existing) return bad(res, 'ไม่พบคลัง', 404)
    if (hasMovements.warehouse(existing.id)) return bad(res, 'คลังนี้มีประวัติสต็อกแล้ว ลบไม่ได้ กรุณาปิดใช้งานแทน', 409)
    inTx(() => {
      db.prepare('DELETE FROM warehouse_staff WHERE warehouse_id = ?').run(existing.id)
      db.prepare('DELETE FROM warehouses WHERE id = ?').run(existing.id)
    })
    addAudit(req.session.user.id, 'ลบคลัง', 'inventory_warehouse', existing.id, { code: existing.code })
    res.json({ ok: true })
  })

  router.put('/warehouses/:id/staff', requireAdmin, (req, res) => {
    const existing = loadWarehouse(req.params.id)
    if (!existing) return bad(res, 'ไม่พบคลัง', 404)
    const userIds = Array.isArray(req.body?.userIds) ? [...new Set(req.body.userIds.map(String))] : null
    if (!userIds) return bad(res, 'กรุณาระบุรายชื่อเจ้าหน้าที่')
    for (const userId of userIds) {
      const user = db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(userId)
      if (!user || !user.is_active || (user.role !== 'storekeeper' && user.role !== 'admin')) return bad(res, 'เลือกได้เฉพาะเจ้าหน้าที่คลังหรือผู้ดูแลระบบที่เปิดใช้งาน')
    }
    inTx(() => {
      db.prepare('DELETE FROM warehouse_staff WHERE warehouse_id = ?').run(existing.id)
      for (const userId of userIds) db.prepare('INSERT INTO warehouse_staff (warehouse_id, user_id) VALUES (?, ?)').run(existing.id, userId)
    })
    addAudit(req.session.user.id, 'กำหนดเจ้าหน้าที่คลัง', 'inventory_warehouse', existing.id, { count: userIds.length })
    res.json({ warehouse: warehouseDto(loadWarehouse(existing.id)) })
  })

  const canUseWarehouse = (user, warehouseId) => user.role === 'admin'
    || Boolean(db.prepare('SELECT 1 FROM warehouse_staff WHERE warehouse_id = ? AND user_id = ?').get(warehouseId, user.id))

  // ---- stock operations ----
  const stock = createStockService(db)
  const counts = createCountService(db, stock)

  /** Maps StockError codes to HTTP statuses; anything else is a real bug and is rethrown. */
  const guarded = (handler) => (req, res) => {
    try { return handler(req, res) } catch (error) {
      if (!(error instanceof StockError)) throw error
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INSUFFICIENT_STOCK' || error.code === 'ALREADY_POSTED' ? 409 : 400
      return bad(res, error.message, status)
    }
  }

  /** Warehouse ids the caller may read: the requested one (403 if not theirs) or every one they can use. */
  function scopeWarehouses(req, res) {
    const requested = String(req.query.warehouseId || '')
    if (requested) {
      if (!loadWarehouse(requested)) { bad(res, 'ไม่พบคลัง', 404); return null }
      if (!canUseWarehouse(req.session.user, requested)) { bad(res, FORBIDDEN, 403); return null }
      return [requested]
    }
    const user = req.session.user
    const rows = user.role === 'admin'
      ? db.prepare('SELECT id FROM warehouses').all()
      : db.prepare('SELECT warehouse_id AS id FROM warehouse_staff WHERE user_id = ?').all(user.id)
    return rows.map((row) => row.id)
  }

  /** Writes need an existing, active warehouse the caller may use. */
  function writableWarehouse(req, res, warehouseId) {
    const warehouse = loadWarehouse(String(warehouseId || ''))
    if (!warehouse) { bad(res, 'ไม่พบคลัง', 404); return null }
    if (!canUseWarehouse(req.session.user, warehouse.id)) { bad(res, FORBIDDEN, 403); return null }
    if (!warehouse.is_active) { bad(res, 'คลังนี้ถูกปิดใช้งาน'); return null }
    return warehouse
  }

  const bangkokDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
  const SETTING_KEY = 'inventory.expiry_warn_days'
  function expiryWarnDays() {
    const raw = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(SETTING_KEY)?.setting_value || '30,60,90'
    return raw.split(',').map(Number).filter((day) => Number.isInteger(day) && day > 0).sort((a, b) => a - b)
  }

  router.get('/settings', (_req, res) => res.json({ expiryWarnDays: expiryWarnDays() }))
  router.put('/settings', requireAdmin, (req, res) => {
    const days = req.body?.expiryWarnDays
    if (!Array.isArray(days) || days.length < 1 || days.length > 5 || !days.every((day) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 365)) {
      return bad(res, 'จำนวนวันแจ้งเตือนต้องเป็นจำนวนเต็ม 1–365 จำนวน 1–5 ค่า')
    }
    const sorted = [...new Set(days)].sort((a, b) => a - b)
    db.prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value').run(SETTING_KEY, sorted.join(','))
    addAudit(req.session.user.id, 'ตั้งค่าแจ้งเตือนยาใกล้หมดอายุ', 'inventory_settings', SETTING_KEY, { days: sorted })
    res.json({ expiryWarnDays: sorted })
  })

  router.post('/receipts', guarded((req, res) => {
    const warehouse = writableWarehouse(req, res, req.body?.warehouseId)
    if (!warehouse) return
    const lines = req.body?.lines
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 200) return bad(res, 'กรุณาระบุรายการรับเข้า 1–200 รายการ')
    const receiptId = randomUUID()
    const note = text(req.body?.note, 200)
    const movements = stock.transaction(() => lines.map((line) => {
      const result = stock.receive({ variantId: String(line?.variantId || ''), warehouseId: warehouse.id, qty: line?.qty, lotNo: line?.lotNo, expiryDate: line?.expiryDate, reason: note, userId: req.session.user.id, refType: 'receipt', refId: receiptId })
      return { variantId: String(line.variantId), lotId: result.lotId, movementId: result.movementId }
    }))
    addAudit(req.session.user.id, 'รับสินค้าเข้าคลัง', 'inventory_stock', receiptId, { warehouse: warehouse.code, lines: lines.length })
    res.status(201).json({ receiptId, movements })
  }))

  router.post('/adjustments', guarded((req, res) => {
    const warehouse = writableWarehouse(req, res, req.body?.warehouseId)
    if (!warehouse) return
    const { variantId, lotId, delta, reason } = req.body || {}
    const result = stock.adjust({ variantId: String(variantId || ''), warehouseId: warehouse.id, lotId: String(lotId || ''), delta, reason, userId: req.session.user.id })
    addAudit(req.session.user.id, 'ปรับยอดสต็อก', 'inventory_stock', result.movementId, { warehouse: warehouse.code, variantId, delta, reason: text(reason, 200) })
    res.status(201).json(result)
  }))

  router.post('/write-offs', guarded((req, res) => {
    const warehouse = writableWarehouse(req, res, req.body?.warehouseId)
    if (!warehouse) return
    const { variantId, lotId, qty, reason, note } = req.body || {}
    const result = stock.writeOff({ variantId: String(variantId || ''), warehouseId: warehouse.id, lotId: String(lotId || ''), qty, reason, note, userId: req.session.user.id })
    addAudit(req.session.user.id, 'ตัดสินค้าทิ้ง', 'inventory_stock', result.movementId, { warehouse: warehouse.code, variantId, qty, reason })
    res.status(201).json(result)
  }))

  router.post('/transfers', guarded((req, res) => {
    const { fromWarehouseId, toWarehouseId, lines } = req.body || {}
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 200) return bad(res, 'กรุณาระบุรายการโอน 1–200 รายการ')
    if (String(fromWarehouseId) === String(toWarehouseId)) return bad(res, 'คลังต้นทางและปลายทางต้องไม่ใช่คลังเดียวกัน')
    const from = writableWarehouse(req, res, fromWarehouseId)
    if (!from) return
    const to = writableWarehouse(req, res, toWarehouseId)
    if (!to) return
    const transferId = randomUUID()
    const transfers = stock.transaction(() => lines.map((line) => stock.transfer({ variantId: String(line?.variantId || ''), fromWarehouseId: from.id, toWarehouseId: to.id, lotId: String(line?.lotId || ''), qty: line?.qty, userId: req.session.user.id })))
    addAudit(req.session.user.id, 'โอนสินค้าระหว่างคลัง', 'inventory_stock', transferId, { from: from.code, to: to.code, lines: lines.length })
    res.status(201).json({ transfers })
  }))

  router.get('/stock', (req, res) => {
    const ids = scopeWarehouses(req, res)
    if (!ids) return
    const where = []
    const params = []
    const type = String(req.query.type || '')
    if (TYPES.includes(type)) { where.push('i.type = ?'); params.push(type) }
    const categoryId = String(req.query.categoryId || '')
    if (categoryId) { where.push('i.category_id = ?'); params.push(categoryId) }
    const q = text(req.query.q, 60)
    if (q) { where.push("(i.name LIKE ? ESCAPE '!' OR i.sku LIKE ? ESCAPE '!')"); params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`) }
    const variants = db.prepare(`SELECT v.id AS variant_id, v.label, i.id AS item_id, i.sku, i.name, i.type, i.unit, i.min_stock
                                 FROM item_variants v JOIN items i ON i.id = v.item_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                                 ORDER BY i.name COLLATE NOCASE, v.rowid`).all(...params)
    const balanceRows = db.prepare(`SELECT b.variant_id, b.warehouse_id, SUM(b.on_hand) AS on_hand, SUM(b.reserved) AS reserved,
                                           MIN(CASE WHEN b.on_hand > 0 AND l.expiry_date != '' THEN l.expiry_date END) AS nearest
                                    FROM stock_balances b LEFT JOIN stock_lots l ON l.id = b.lot_id GROUP BY b.variant_id, b.warehouse_id`).all()
    const balances = new Map(balanceRows.map((row) => [`${row.variant_id}|${row.warehouse_id}`, row]))
    const itemTotals = new Map()
    for (const row of db.prepare(`SELECT v.item_id, b.warehouse_id, SUM(b.on_hand) AS on_hand FROM stock_balances b JOIN item_variants v ON v.id = b.variant_id GROUP BY v.item_id, b.warehouse_id`).all()) itemTotals.set(`${row.item_id}|${row.warehouse_id}`, row.on_hand)
    const warehouses = ids.map(loadWarehouse).filter(Boolean)
    const today = bangkokDate()
    const maxDays = Math.max(...expiryWarnDays(), 0)
    const filter = String(req.query.filter || '')
    const rows = []
    for (const variant of variants) {
      for (const warehouse of warehouses) {
        const balance = balances.get(`${variant.variant_id}|${warehouse.id}`)
        if (!balance) continue // only variants that have ever been stocked in this warehouse
        const isLow = variant.min_stock > 0 && (itemTotals.get(`${variant.item_id}|${warehouse.id}`) ?? 0) < variant.min_stock
        const nearestExpiry = balance.nearest || ''
        const isExpiring = Boolean(nearestExpiry) && daysBetween(today, nearestExpiry) <= maxDays
        if ((filter === 'low' && !isLow) || (filter === 'expiring' && !isExpiring)) continue
        rows.push({
          variantId: variant.variant_id, itemId: variant.item_id, sku: variant.sku, name: variant.name, variantLabel: variant.label, type: variant.type, unit: variant.unit,
          warehouseId: warehouse.id, warehouseName: warehouse.name, onHand: balance.on_hand, reserved: balance.reserved, available: balance.on_hand - balance.reserved,
          minStock: variant.min_stock, nearestExpiry, isLow, isExpiring,
        })
      }
    }
    res.json({ rows })
  })

  router.get('/stock/lots', (req, res) => {
    const warehouseId = String(req.query.warehouseId || '')
    const variantId = String(req.query.variantId || '')
    if (!warehouseId || !variantId) return bad(res, 'กรุณาระบุคลังและสินค้า')
    const ids = scopeWarehouses(req, res)
    if (!ids) return
    const lots = db.prepare(`SELECT l.id, l.lot_no, l.expiry_date, b.on_hand, b.reserved FROM stock_lots l
                             JOIN stock_balances b ON b.lot_id = l.id AND b.variant_id = l.variant_id AND b.warehouse_id = l.warehouse_id
                             WHERE l.variant_id = ? AND l.warehouse_id = ? AND b.on_hand > 0
                             ORDER BY (l.expiry_date = '') ASC, l.expiry_date ASC, l.received_at ASC, l.rowid ASC`).all(variantId, warehouseId)
    res.json({ lots: lots.map((lot) => ({ lotId: lot.id, lotNo: lot.lot_no, expiryDate: lot.expiry_date, onHand: lot.on_hand, reserved: lot.reserved })) })
  })

  // ---- movements (the ledger) ----
  function movementQuery(req, res) {
    const ids = scopeWarehouses(req, res)
    if (!ids) return null
    const where = [`m.warehouse_id IN (${ids.map(() => '?').join(',') || "''"})`]
    const params = [...ids]
    const variantId = String(req.query.variantId || '')
    if (variantId) { where.push('m.variant_id = ?'); params.push(variantId) }
    const type = String(req.query.type || '')
    if (type) { where.push('m.type = ?'); params.push(type) }
    const from = String(req.query.from || '')
    const to = String(req.query.to || '')
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('substr(m.created_at, 1, 10) >= ?'); params.push(from) }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('substr(m.created_at, 1, 10) <= ?'); params.push(to) }
    return { whereSql: `WHERE ${where.join(' AND ')}`, params }
  }
  const movementSelect = `SELECT m.id, m.type, m.variant_id, m.warehouse_id, m.qty, m.reason, m.ref_type, m.ref_id, m.created_at,
      i.sku, i.name AS item_name, v.label AS variant_label, w.name AS warehouse_name, COALESCE(l.lot_no, '') AS lot_no, COALESCE(l.expiry_date, '') AS expiry_date,
      COALESCE(u.display_name, '') AS user_name
    FROM stock_movements m
    LEFT JOIN item_variants v ON v.id = m.variant_id LEFT JOIN items i ON i.id = v.item_id
    LEFT JOIN warehouses w ON w.id = m.warehouse_id LEFT JOIN stock_lots l ON l.id = m.lot_id LEFT JOIN users u ON u.id = m.user_id`
  const movementDto = (row) => ({
    id: row.id, type: row.type, variantId: row.variant_id, sku: row.sku || '', itemName: row.item_name || '', variantLabel: row.variant_label || '',
    warehouseId: row.warehouse_id, warehouseName: row.warehouse_name || '', lotNo: row.lot_no, expiryDate: row.expiry_date, qty: row.qty,
    reason: row.reason, refType: row.ref_type, refId: row.ref_id, userName: row.user_name, createdAt: row.created_at,
  })

  router.get('/movements', (req, res) => {
    const query = movementQuery(req, res)
    if (!query) return
    const page = Math.max(Number.parseInt(String(req.query.page || '1'), 10) || 1, 1)
    const pageSize = Math.min(Math.max(Number.parseInt(String(req.query.pageSize || '25'), 10) || 25, 1), 100)
    const total = db.prepare(`SELECT COUNT(*) AS n FROM stock_movements m ${query.whereSql}`).get(...query.params).n
    const rows = db.prepare(`${movementSelect} ${query.whereSql} ORDER BY m.created_at DESC, m.rowid DESC LIMIT ? OFFSET ?`).all(...query.params, pageSize, (page - 1) * pageSize)
    res.json({ rows: rows.map(movementDto), total, page, pageSize })
  })

  router.get('/movements/export', async (req, res) => {
    const query = movementQuery(req, res)
    if (!query) return
    const rows = db.prepare(`${movementSelect} ${query.whereSql} ORDER BY m.created_at DESC, m.rowid DESC LIMIT 50000`).all(...query.params).map(movementDto)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Stock movements')
    sheet.columns = [
      { header: 'วันเวลา', key: 'createdAt', width: 22 }, { header: 'ประเภท', key: 'type', width: 14 }, { header: 'คลัง', key: 'warehouseName', width: 20 },
      { header: 'รหัสสินค้า', key: 'sku', width: 16 }, { header: 'สินค้า', key: 'itemName', width: 28 }, { header: 'ตัวเลือก', key: 'variantLabel', width: 12 },
      { header: 'ล็อต', key: 'lotNo', width: 14 }, { header: 'วันหมดอายุ', key: 'expiryDate', width: 14 }, { header: 'จำนวน', key: 'qty', width: 10 },
      { header: 'เหตุผล', key: 'reason', width: 30 }, { header: 'ผู้ดำเนินการ', key: 'userName', width: 20 },
    ]
    sheet.getRow(1).font = { bold: true }
    for (const row of rows) sheet.addRow(row)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="stock-movements-${bangkokDate()}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  })

  // ---- alerts ----
  router.get('/alerts', (req, res) => {
    const ids = scopeWarehouses(req, res)
    if (!ids) return
    const today = bangkokDate()
    const maxDays = Math.max(...expiryWarnDays(), 0)
    const inList = ids.map(() => '?').join(',') || "''"
    const lowStock = db.prepare(`SELECT i.id AS item_id, i.sku, i.name, i.min_stock, w.id AS warehouse_id, w.name AS warehouse_name, SUM(b.on_hand) AS on_hand
                                 FROM stock_balances b JOIN item_variants v ON v.id = b.variant_id JOIN items i ON i.id = v.item_id JOIN warehouses w ON w.id = b.warehouse_id
                                 WHERE b.warehouse_id IN (${inList}) AND i.min_stock > 0 AND i.is_active = 1 GROUP BY i.id, w.id HAVING SUM(b.on_hand) < i.min_stock
                                 ORDER BY i.name COLLATE NOCASE`).all(...ids)
    const lots = db.prepare(`SELECT i.id AS item_id, i.name, v.id AS variant_id, v.label, l.lot_no, l.expiry_date, w.id AS warehouse_id, w.name AS warehouse_name, b.on_hand
                             FROM stock_balances b JOIN stock_lots l ON l.id = b.lot_id JOIN item_variants v ON v.id = b.variant_id JOIN items i ON i.id = v.item_id JOIN warehouses w ON w.id = b.warehouse_id
                             WHERE b.warehouse_id IN (${inList}) AND b.on_hand > 0 AND l.expiry_date != '' ORDER BY l.expiry_date`).all(...ids)
    res.json({
      lowStock: lowStock.map((row) => ({ itemId: row.item_id, sku: row.sku, name: row.name, warehouseId: row.warehouse_id, warehouseName: row.warehouse_name, onHand: row.on_hand, minStock: row.min_stock })),
      expiring: lots.map((row) => ({ itemId: row.item_id, variantId: row.variant_id, name: row.name, variantLabel: row.label, warehouseId: row.warehouse_id, warehouseName: row.warehouse_name, lotNo: row.lot_no, expiryDate: row.expiry_date, daysLeft: daysBetween(today, row.expiry_date), onHand: row.on_hand }))
        .filter((row) => row.daysLeft <= maxDays),
      expiryWarnDays: expiryWarnDays(),
    })
  })

  // ---- stock counts ----
  const countDto = (row) => ({
    id: row.id, warehouseId: row.warehouse_id, warehouseName: row.warehouse_name || '', status: row.status,
    createdAt: row.created_at, postedAt: row.posted_at, createdByName: row.created_by_name || '', lineCount: row.line_count ?? 0,
  })
  const countSelect = `SELECT c.*, w.name AS warehouse_name, COALESCE(u.display_name, '') AS created_by_name,
      (SELECT COUNT(*) FROM stock_count_lines l WHERE l.count_id = c.id) AS line_count
    FROM stock_counts c LEFT JOIN warehouses w ON w.id = c.warehouse_id LEFT JOIN users u ON u.id = c.created_by`

  /** Loads a count the caller may touch (404 if missing, 403 if the warehouse is not theirs). */
  function accessibleCount(req, res) {
    const count = db.prepare(`${countSelect} WHERE c.id = ?`).get(req.params.id)
    if (!count) { bad(res, 'ไม่พบใบนับสต็อก', 404); return null }
    if (!canUseWarehouse(req.session.user, count.warehouse_id)) { bad(res, FORBIDDEN, 403); return null }
    return count
  }

  router.get('/counts', (req, res) => {
    const ids = scopeWarehouses(req, res)
    if (!ids) return
    const rows = db.prepare(`${countSelect} WHERE c.warehouse_id IN (${ids.map(() => '?').join(',') || "''"}) ORDER BY c.created_at DESC, c.rowid DESC LIMIT 200`).all(...ids)
    res.json({ counts: rows.map(countDto) })
  })

  router.post('/counts', guarded((req, res) => {
    const warehouse = writableWarehouse(req, res, req.body?.warehouseId)
    if (!warehouse) return
    const { id } = counts.create({ warehouseId: warehouse.id, userId: req.session.user.id })
    addAudit(req.session.user.id, 'เริ่มนับสต็อก', 'inventory_count', id, { warehouse: warehouse.code })
    res.status(201).json({ id })
  }))

  router.get('/counts/:id', (req, res) => {
    const count = accessibleCount(req, res)
    if (!count) return
    const lines = db.prepare(`SELECT l.variant_id, l.lot_id, l.system_qty, l.counted_qty, i.sku, i.name AS item_name, v.label AS variant_label,
                                     COALESCE(s.lot_no, '') AS lot_no, COALESCE(s.expiry_date, '') AS expiry_date
                              FROM stock_count_lines l LEFT JOIN item_variants v ON v.id = l.variant_id LEFT JOIN items i ON i.id = v.item_id LEFT JOIN stock_lots s ON s.id = l.lot_id
                              WHERE l.count_id = ? ORDER BY i.name COLLATE NOCASE, v.rowid, s.expiry_date`).all(count.id)
    res.json({
      count: {
        ...countDto(count),
        lines: lines.map((line) => ({
          variantId: line.variant_id, lotId: line.lot_id, sku: line.sku || '', itemName: line.item_name || '', variantLabel: line.variant_label || '',
          lotNo: line.lot_no, expiryDate: line.expiry_date, systemQty: line.system_qty, countedQty: line.counted_qty,
        })),
      },
    })
  })

  router.put('/counts/:id/lines', guarded((req, res) => {
    const count = accessibleCount(req, res)
    if (!count) return
    const lines = req.body?.lines
    if (!Array.isArray(lines) || lines.length > 5000) return bad(res, 'รายการนับไม่ถูกต้อง')
    counts.setLines(count.id, lines.map((line) => ({ variantId: String(line?.variantId || ''), lotId: String(line?.lotId ?? ''), countedQty: line?.countedQty })))
    res.json({ ok: true })
  }))

  router.post('/counts/:id/post', guarded((req, res) => {
    const count = accessibleCount(req, res)
    if (!count) return
    const result = counts.post(count.id, req.session.user.id)
    addAudit(req.session.user.id, 'ปรับยอดจากการนับสต็อก', 'inventory_count', count.id, { warehouse: count.warehouse_name, adjustments: result.adjustments })
    res.json(result)
  }))

  // ---- item images ----
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new ImageError('รองรับไฟล์ JPG, PNG หรือ WebP เท่านั้น'))
      callback(null, true)
    },
  })
  const singleImage = (req, res, next) => imageUpload.single('image')(req, res, (error) => {
    if (!error) return next()
    bad(res, error.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์รูปใหญ่เกิน 8 MB' : error.message || 'อัปโหลดรูปไม่สำเร็จ')
  })

  // Any signed-in user may view item photos (employees browse the catalog); registered on app so the staff-only router guard does not apply.
  app.get('/api/inventory/items/:id/image', requireAuth, (req, res, next) => {
    const item = db.prepare('SELECT image FROM items WHERE id = ?').get(req.params.id)
    if (!item || !item.image) return res.status(404).json({ error: 'ไม่พบรูปสินค้า' })
    const name = req.query.size === 'thumb' ? thumbName(path.basename(item.image)) : path.basename(item.image)
    res.type('image/jpeg').set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' })
      .sendFile(path.join(imageDir, name), (error) => error && next(error))
  })

  router.post('/items/:id/image', requireAdmin, singleImage, async (req, res) => {
    const item = loadItem(req.params.id)
    if (!item) return bad(res, 'ไม่พบสินค้า', 404)
    if (!req.file) return bad(res, 'กรุณาเลือกรูปภาพ')
    let saved
    try { saved = await saveImage(req.file.buffer, imageDir) } catch (error) {
      if (error instanceof ImageError) return bad(res, error.message)
      throw error
    }
    db.prepare('UPDATE items SET image = ? WHERE id = ?').run(saved.stored, item.id)
    await removeImage(imageDir, item.image)
    addAudit(req.session.user.id, 'อัปโหลดรูปสินค้า', 'inventory_item', item.id, { sku: item.sku })
    res.json({ item: itemDto(loadItem(item.id)) })
  })

  router.delete('/items/:id/image', requireAdmin, async (req, res) => {
    const item = loadItem(req.params.id)
    if (!item) return bad(res, 'ไม่พบสินค้า', 404)
    db.prepare("UPDATE items SET image = '' WHERE id = ?").run(item.id)
    await removeImage(imageDir, item.image)
    addAudit(req.session.user.id, 'ลบรูปสินค้า', 'inventory_item', item.id, { sku: item.sku })
    res.json({ item: itemDto(loadItem(item.id)) })
  })

  app.use('/api/inventory', router)
  return { router, canUseWarehouse, requireStockStaff, stock, counts, guarded, scopeWarehouses, writableWarehouse }
}
