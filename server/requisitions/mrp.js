/**
 * Requisitions through MRP (step D of the MRP unified inventory). When MRP_INVENTORY_URL and MRP_INVENTORY_TOKEN are set, the
 * employee keeps this web's catalog, cart and "my requests", but the catalog and the stock come from the MRP inventory and a checkout
 * raises the requisition there (/api/integration/safety-stock). Approval (the SAFETY policy) and issuing happen in MRP; this web only
 * shows the status. The answers keep the shapes the screens already read (see service.js).
 *
 * The employee goes to MRP in X-Acting-User: percent-encoded JSON {code, name, department}; the shared token in X-Integration-Token.
 */
export class MrpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const TYPES = ['ppe', 'medicine']
const STATUS = { draft: 'in_approval', submitted: 'in_approval', approved: 'approved', partly_issued: 'partially_issued', issued: 'issued', closed: 'closed', rejected: 'rejected', cancelled: 'cancelled' }
const MOVED = 'การอนุมัติและการจ่ายของย้ายไปทำในระบบ MRP แล้ว'

export function mrpConfig(env = process.env) {
  const baseUrl = String(env.MRP_INVENTORY_URL ?? '').trim().replace(/\/+$/, '')
  const token = String(env.MRP_INVENTORY_TOKEN ?? '').trim()
  return baseUrl && token ? { baseUrl, token } : null
}

export function createMrpRequisitions(db, { baseUrl, token, fetch = globalThis.fetch, cacheMs = 20_000 }) {
  const assertType = (type) => { if (!TYPES.includes(type)) throw new MrpError(400, 'ประเภทไม่ถูกต้อง') }

  /** The employee as MRP gets them: the employee code (or the user name), the name and the department of the directory. */
  function employee(user) {
    const row = db.prepare(`SELECT u.username, u.display_name, u.employee_code,
                                   COALESCE(CASE WHEN d.department_th != '' THEN d.department_th ELSE d.department_en END, '') AS department
                              FROM users u LEFT JOIN employee_directory d ON UPPER(TRIM(d.employee_code)) = UPPER(TRIM(u.employee_code)) WHERE u.id = ?`).get(user.id)
    return { code: (row?.employee_code || row?.username || user.username || user.id).trim(), name: row?.display_name || user.display_name || '', department: row?.department || '' }
  }

  async function call(method, path, user, body) {
    const headers = { 'X-Integration-Token': token, Accept: 'application/json' }
    if (user) headers['X-Acting-User'] = encodeURIComponent(JSON.stringify(employee(user)))
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let response
    try {
      response = await fetch(`${baseUrl}/api/integration/safety-stock${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
    } catch {
      throw new MrpError(502, 'เชื่อมต่อระบบ MRP ไม่ได้ กรุณาลองใหม่อีกครั้ง')
    }
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!response.ok) throw new MrpError(response.status >= 500 ? 502 : response.status, data?.detail || 'ระบบ MRP ไม่รับรายการนี้')
    return data
  }

  // ---- catalog (kept a few seconds: the cart asks for it on every change) ----
  let cache = { at: 0, data: null }
  async function rawCatalog() {
    if (cache.data && Date.now() - cache.at < cacheMs) return cache.data
    const data = await call('GET', '/catalog', null)
    cache = { at: Date.now(), data }
    return data
  }

  const variantIndex = (data) => {
    const index = new Map()
    for (const item of data.items) for (const variant of item.variants) index.set(variant.itemId, { item, variant })
    return index
  }

  async function catalog({ type, q } = {}) {
    const data = await rawCatalog()
    const term = String(q ?? '').trim().toLowerCase()
    return data.items
      .filter((item) => TYPES.includes(item.itemType) && (!TYPES.includes(type) || item.itemType === type))
      .filter((item) => !term || item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term))
      .map((item) => ({
        itemId: item.itemId, sku: item.code, name: item.name, type: item.itemType, unit: item.unit, categoryId: null, categoryName: item.categoryName || '', imageUrl: item.imageUrl || null,
        variants: item.variants.map((variant) => ({ variantId: variant.itemId, label: variant.label, available: Number(variant.available) })),
      }))
  }

  // ---- cart: kept here, the lines point at MRP items ----
  const cartRow = (userId, type) => db.prepare('SELECT * FROM carts WHERE user_id = ? AND type = ?').get(userId, type)

  async function getCart(userId, type) {
    assertType(type)
    const cart = cartRow(userId, type)
    if (!cart) return { type, lines: [] }
    const index = variantIndex(await rawCatalog())
    const rows = db.prepare('SELECT variant_id, qty FROM cart_lines WHERE cart_id = ? ORDER BY rowid').all(cart.id)
    return {
      type,
      lines: rows.map((row) => {
        const found = index.get(row.variant_id)
        return {
          variantId: row.variant_id, qty: row.qty, itemId: found?.item.itemId ?? '', sku: found?.item.code ?? '', name: found?.item.name ?? 'สินค้าที่ไม่มีแล้ว',
          variantLabel: found?.variant.label ?? '', unit: found?.item.unit ?? '', imageUrl: found?.item.imageUrl || null,
          available: Number(found?.variant.available ?? 0), active: Boolean(found && found.item.itemType === type),
        }
      }),
    }
  }

  async function setCartLine(userId, type, variantId, qty) {
    assertType(type)
    if (!Number.isInteger(qty) || qty < 0) throw new MrpError(400, 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0')
    const found = variantIndex(await rawCatalog()).get(variantId)
    if (!found) throw new MrpError(400, 'ไม่พบสินค้านี้หรือสินค้าถูกปิดใช้งาน')
    if (found.item.itemType !== type) throw new MrpError(400, 'สินค้านี้ไม่ใช่ประเภทเดียวกับตะกร้า')
    const stamp = new Date().toISOString()
    let cart = cartRow(userId, type)
    if (!cart) {
      if (qty === 0) return getCart(userId, type)
      cart = { id: crypto.randomUUID() }
      db.prepare('INSERT INTO carts (id, user_id, type, updated_at) VALUES (?, ?, ?, ?)').run(cart.id, userId, type, stamp)
    } else db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(stamp, cart.id)
    if (qty === 0) db.prepare('DELETE FROM cart_lines WHERE cart_id = ? AND variant_id = ?').run(cart.id, variantId)
    else {
      db.prepare('INSERT OR IGNORE INTO cart_lines (cart_id, variant_id, qty) VALUES (?, ?, 1)').run(cart.id, variantId)
      db.prepare('UPDATE cart_lines SET qty = ? WHERE cart_id = ? AND variant_id = ?').run(qty, cart.id, variantId)
    }
    return getCart(userId, type)
  }

  function clearCart(userId, type) {
    assertType(type)
    const cart = cartRow(userId, type)
    if (!cart) return
    db.prepare('DELETE FROM cart_lines WHERE cart_id = ?').run(cart.id)
    db.prepare('DELETE FROM carts WHERE id = ?').run(cart.id)
  }

  // ---- warehouses and the approval route ----
  async function warehouseOptions(userId, type) {
    const data = await rawCatalog()
    const lines = (await getCart(userId, type)).lines
    const index = variantIndex(data)
    return data.warehouses
      .filter((warehouse) => !warehouse.allowedItemTypes.length || warehouse.allowedItemTypes.includes(type))
      .map((warehouse) => ({
        id: warehouse.id, code: warehouse.code, name: warehouse.name, total: lines.length,
        covered: lines.filter((line) => Number(index.get(line.variantId)?.variant.availableByWarehouse?.[warehouse.id] ?? 0) >= line.qty).length,
      }))
      .sort((a, b) => b.covered - a.covered)
  }

  function previewRoute() {
    return {
      templateName: 'อนุมัติในระบบ MRP',
      steps: [{ position: 1, name: 'ฝ่ายความปลอดภัยอนุมัติ', approverType: 'role', mode: 'any', applies: true, note: 'พิจารณาและจ่ายของในระบบ MRP', approvers: [] }],
    }
  }

  // ---- requisitions ----
  const summaryOf = ({ requisition: r, type }) => ({
    id: r.id, number: r.number, type, status: STATUS[r.status] ?? r.status, requesterId: r.requesterUserId, requesterName: r.requesterName || '', department: r.requesterDepartment || '',
    warehouseId: r.warehouseId, warehouseName: r.warehouseCode, reason: r.purpose || '', neededBy: r.neededBy || '', createdAt: r.createdAt, submittedAt: r.submittedAt || r.createdAt,
    approvedAt: r.status === 'approved' || r.status === 'partly_issued' || r.status === 'issued' ? r.decidedAt || '' : '',
    lineCount: r.lines.length, totalQty: r.lines.reduce((sum, line) => sum + Number(line.qtyRequested), 0),
    stepName: r.status === 'submitted' ? 'ฝ่ายความปลอดภัยอนุมัติ (MRP)' : '', dueAt: '', overdue: false,
  })

  function detailOf(answer, user) {
    const r = answer.requisition
    const events = [{ id: `${r.id}-submitted`, step: 0, actorId: user.id, actorName: r.requesterName || '', action: 'submitted', comment: r.purpose || '', at: r.submittedAt || r.createdAt }]
    if (r.decidedAt) {
      const action = r.status === 'rejected' ? 'rejected' : r.status === 'cancelled' ? 'cancelled' : 'approved'
      events.push({ id: `${r.id}-decided`, step: 1, actorId: '', actorName: r.decidedByName || '', action, comment: r.decisionNote || '', at: r.decidedAt })
    }
    return {
      ...summaryOf(answer),
      requesterCode: r.requesterUserId.replace(/^ds:/, ''), requesterPosition: '', currentStep: r.status === 'submitted' ? 1 : 0,
      lines: r.lines.map((line) => ({
        id: line.id, variantId: line.itemId, itemId: line.itemId, sku: line.itemCode, name: line.itemName, variantLabel: '', unit: line.stockUnit, imageUrl: null,
        qtyRequested: Number(line.qtyRequested), qtyApproved: Number(line.qtyApproved), qtyIssued: Number(line.qtyIssued), qtyReturned: Number(line.qtyReturned), note: line.note || '',
      })),
      steps: [{ position: 1, name: 'ฝ่ายความปลอดภัยอนุมัติ (MRP)', approverType: 'role', mode: 'any', status: r.status === 'submitted' ? 'active' : 'approved', allowEditQty: true,
        approvers: [], approvals: [], dueAt: '', overdue: false, escalated: false, slaHours: 0 }],
      events, photos: [], documentNumbers: r.documentNumbers ?? [],
    }
  }

  async function checkout(user, { type, warehouseId, reason, neededBy = '' }) {
    assertType(type)
    const text = String(reason ?? '').trim().slice(0, 500)
    if (!text) throw new MrpError(400, 'กรุณาระบุเหตุผลการเบิก')
    const cart = await getCart(user.id, type)
    if (!cart.lines.length) throw new MrpError(400, 'ตะกร้าว่าง')
    const inactive = cart.lines.find((line) => !line.active)
    if (inactive) throw new MrpError(400, `${inactive.name} ถูกปิดใช้งานแล้ว กรุณานำออกจากตะกร้า`)
    const answer = await call('POST', '/requisitions', user, {
      warehouseId: String(warehouseId ?? ''), reason: text, neededBy: neededBy ? String(neededBy) : null,
      lines: cart.lines.map((line) => ({ itemId: line.variantId, qty: line.qty })),
    })
    clearCart(user.id, type)
    cache = { at: 0, data: null }
    return detailOf(answer, user)
  }

  async function listMine(user, { status } = {}) {
    const data = await call('GET', '/requisitions', user)
    return data.requisitions.map(summaryOf).filter((row) => !status || row.status === status)
  }

  const get = async (user, id) => detailOf(await call('GET', `/requisitions/${encodeURIComponent(id)}`, user), user)
  const cancel = async (user, id, reason) => detailOf(await call('POST', `/requisitions/${encodeURIComponent(id)}/cancel`, user, { reason: reason ? String(reason).slice(0, 200) : null }), user)

  return { MOVED, catalog, getCart, setCartLine, clearCart, warehouseOptions, previewRoute, checkout, listMine, get, cancel }
}
