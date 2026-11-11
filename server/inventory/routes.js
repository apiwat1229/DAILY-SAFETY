import express from 'express'
import { randomUUID } from 'node:crypto'

const TYPES = ['ppe', 'medicine']
const FORBIDDEN = 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้'

/** All /api/inventory endpoints. Reads need admin or storekeeper; catalog and warehouse writes need admin. */
export function registerInventoryRoutes(app, { db, requireAuth, requireAdmin, addAudit, nowIso }) {
  const router = express.Router()

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

  router.delete('/items/:id', requireAdmin, (req, res) => {
    const existing = loadItem(req.params.id)
    if (!existing) return bad(res, 'ไม่พบสินค้า', 404)
    if (hasMovements.item(existing.id)) return bad(res, 'สินค้านี้มีประวัติสต็อกแล้ว ลบไม่ได้ กรุณาปิดใช้งานแทน', 409)
    inTx(() => {
      db.prepare('DELETE FROM item_variants WHERE item_id = ?').run(existing.id)
      db.prepare('DELETE FROM items WHERE id = ?').run(existing.id)
    })
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

  app.use('/api/inventory', router)
  return { router, canUseWarehouse, requireStockStaff }
}
