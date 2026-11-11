// Creates sample PPE and medicine items in every category, a sample stock count and sample requisitions, with real photos (scripts/sample-photos), a sample warehouse and stock.
// Safe to re-run: existing sample items are updated (name, category, photo) and never restocked. Sample SKUs start with "DEMO-".
//
//   SEED_URL=http://localhost:4000 SEED_USER=admin SEED_PASSWORD=... node scripts/seed-samples.mjs
import { readFile } from 'node:fs/promises'

const base = (process.env.SEED_URL || 'http://localhost:4000').replace(/\/$/, '')
const user = process.env.SEED_USER || 'admin'
/** Reads the admin password from SEED_PASSWORD, or asks for it in the terminal without echoing it. */
async function askPassword() {
  if (process.env.SEED_PASSWORD) return process.env.SEED_PASSWORD
  if (!process.stdin.isTTY) { console.error('Set SEED_PASSWORD, or run this in a terminal to be asked for it.'); process.exit(1) }
  process.stdout.write(`Password for ${user} on ${base}: `)
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8')
  return new Promise((resolve) => {
    let text = ''
    process.stdin.on('data', (chunk) => {
      for (const char of chunk) {
        const code = char.charCodeAt(0)
        if (code === 13 || code === 10) { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write(String.fromCharCode(10)); return resolve(text) }
        if (code === 3) process.exit(1)
        if (code === 127 || code === 8) text = text.slice(0, -1)
        else if (code >= 32) text += char
      }
    })
  })
}
const password = await askPassword()

let cookie = ''
async function call(method, path, body, form) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  })
  const set = response.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  const json = (response.headers.get('content-type') || '').includes('json') ? await response.json() : null
  return { status: response.status, json }
}
const must = (result, label) => { if (result.status >= 300) throw new Error(`${label}: ${result.status} ${JSON.stringify(result.json)}`); return result.json }

// ---- catalog: every category has at least one sample; photos are real (scripts/sample-photos, credits in CREDITS.md) ----
// [sku, name, unit, minStock, variants, category, stock qty]
const PPE = [
  ['DEMO-PPE-001', 'หมวกนิรภัย', 'ใบ', 20, [''], 'ศีรษะ', 80],
  ['DEMO-PPE-002', 'แว่นตานิรภัย', 'อัน', 30, [''], 'ดวงตาและใบหน้า', 120],
  ['DEMO-PPE-008', 'หน้ากากป้องกันใบหน้า (Face Shield)', 'อัน', 10, [''], 'ดวงตาและใบหน้า', 40],
  ['DEMO-PPE-003', 'ถุงมือป้องกันสารเคมี', 'คู่', 50, ['S', 'M', 'L'], 'มือ', 100],
  ['DEMO-PPE-004', 'ที่อุดหู (ปลั๊กอุดหู)', 'คู่', 100, [''], 'หู', 300],
  ['DEMO-PPE-009', 'ที่ครอบหู ลดเสียง', 'ชุด', 10, [''], 'หู', 25],
  ['DEMO-PPE-005', 'หน้ากากอนามัย (กล่อง 50 ชิ้น)', 'กล่อง', 10, [''], 'ระบบหายใจ', 40],
  ['DEMO-PPE-010', 'หน้ากากกันฝุ่น N95', 'ชิ้น', 50, [''], 'ระบบหายใจ', 200],
  ['DEMO-PPE-006', 'รองเท้านิรภัย', 'คู่', 5, ['39', '40', '41', '42', '43'], 'เท้า', 12],
  ['DEMO-PPE-007', 'เสื้อสะท้อนแสง', 'ตัว', 10, ['M', 'L', 'XL'], 'ร่างกาย', 30],
  ['DEMO-PPE-011', 'สายรัดนิรภัยกันตก', 'ชุด', 3, [''], 'ป้องกันการตก', 10],
]
// [sku, name, unit, minStock, category, stock qty, expiry]
const MEDICINE = [
  ['DEMO-MED-001', 'พาราเซตามอล (แผง)', 'แผง', 20, 'ยาแก้ปวดลดไข้', 100, '2028-06-30'],
  ['DEMO-MED-006', 'ยาแก้แพ้ เซทิริซีน (แผง)', 'แผง', 10, 'ยาแก้แพ้', 60, '2028-02-29'],
  ['DEMO-MED-002', 'แอลกอฮอล์ล้างแผล 70%', 'ขวด', 10, 'ปฐมพยาบาล', 40, '2028-03-31'],
  ['DEMO-MED-003', 'พลาสเตอร์ปิดแผล', 'กล่อง', 10, 'ปฐมพยาบาล', 50, '2029-01-31'],
  ['DEMO-MED-004', 'เกลือแร่ ORS', 'ซอง', 30, 'เกลือแร่และระบบทางเดินอาหาร', 150, '2027-12-31'],
  ['DEMO-MED-005', 'ครีมไฮโดรคอร์ติโซน (ผื่นคัน)', 'หลอด', 5, 'ยาใช้ภายนอก', 25, '2027-09-30'],
  ['DEMO-MED-007', 'ยาหม่อง ยาทานวด', 'กระปุก', 10, 'ยาใช้ภายนอก', 40, '2028-08-31'],
]
const LEGACY_CATEGORIES = ['อุปกรณ์ป้องกัน (ตัวอย่าง)', 'ยาสามัญประจำบ้าน (ตัวอย่าง)']

must(await call('POST', '/api/auth/login', { username: user, password, rememberMe: false }), 'login')

const warehouses = must(await call('GET', '/api/inventory/warehouses'), 'warehouses').warehouses
async function ensureWarehouse(code, name, type) {
  const found = warehouses.find((row) => row.code === code)
  const warehouse = found ?? must(await call('POST', '/api/inventory/warehouses', { code, name, type }), `create warehouse ${code}`).warehouse
  console.log(`warehouse ${warehouse.code} (${type})`)
  return warehouse
}
// PPE and medicine live in separate warehouses, so each can have its own storekeeper and approval route.
const ppeWarehouse = await ensureWarehouse('PPE-SAMPLE', 'คลัง PPE (ตัวอย่าง)', 'ppe')
const medWarehouse = await ensureWarehouse('MED-SAMPLE', 'คลังยา (ตัวอย่าง)', 'medicine')
const warehouseFor = (type) => (type === 'medicine' ? medWarehouse : ppeWarehouse)

// The first version of this script used one mixed warehouse (SAMPLE): move its free stock to the right warehouse.
const legacy = warehouses.find((row) => row.code === 'SAMPLE')
if (legacy) {
  const rows = must(await call('GET', `/api/inventory/stock?warehouseId=${legacy.id}`), 'legacy stock').rows
  let moved = 0
  for (const row of rows) {
    const lots = must(await call('GET', `/api/inventory/stock/lots?warehouseId=${legacy.id}&variantId=${row.variantId}`), 'lots').lots
    const lines = lots.filter((lot) => lot.onHand - lot.reserved > 0).map((lot) => ({ variantId: row.variantId, lotId: lot.lotId, qty: lot.onHand - lot.reserved }))
    if (lines.length === 0) continue
    must(await call('POST', '/api/inventory/transfers', { fromWarehouseId: legacy.id, toWarehouseId: warehouseFor(row.type).id, lines }), `move ${row.sku}`)
    moved += lines.length
  }
  if (moved) console.log(`moved ${moved} stock lines out of the old SAMPLE warehouse`)
  const left = must(await call('GET', `/api/inventory/stock?warehouseId=${legacy.id}`), 'legacy stock').rows.reduce((sum, row) => sum + row.onHand, 0)
  if (left === 0 && legacy.isActive) { must(await call('PATCH', `/api/inventory/warehouses/${legacy.id}`, { isActive: false }), 'retire SAMPLE'); console.log('old SAMPLE warehouse switched off (empty)') }
}

const categoryCache = new Map()
async function category(name, type) {
  const key = `${type}:${name}`
  if (categoryCache.has(key)) return categoryCache.get(key)
  const rows = must(await call('GET', '/api/inventory/categories'), 'categories').categories
  const found = rows.find((row) => row.name === name && row.type === type)
    ?? must(await call('POST', '/api/inventory/categories', { name, type, sortOrder: categoryCache.size }), `create category ${name}`).category
  categoryCache.set(key, found)
  return found
}

const photoFile = (sku) => new URL(`./sample-photos/${sku}.jpg`, import.meta.url)
async function uploadPhoto(item, sku) {
  const form = new FormData()
  form.append('image', new Blob([await readFile(photoFile(sku))], { type: 'image/jpeg' }), `${sku}.jpg`)
  must(await call('POST', `/api/inventory/items/${item.id}/image`, undefined, form), `photo ${sku}`)
}

const existing = new Map(must(await call('GET', '/api/inventory/items'), 'items').items.map((row) => [row.sku, row]))
const receipts = { ppe: [], medicine: [] }
async function upsert({ sku, name, type, categoryName, unit, minStock, variants, qty, expiry }) {
  const cat = await category(categoryName, type)
  const found = existing.get(sku)
  if (found) {
    const item = must(await call('PATCH', `/api/inventory/items/${found.id}`, { name, unit, minStock, categoryId: cat.id }), `update ${sku}`).item
    await uploadPhoto(item, sku)
    console.log(`updated ${sku} ${name}`)
    return
  }
  const item = must(await call('POST', '/api/inventory/items', { sku, name, type, categoryId: cat.id, unit, minStock, variants }), `create ${sku}`).item
  await uploadPhoto(item, sku)
  for (const variant of item.variants) receipts[type].push({ variantId: variant.id, qty, ...(type === 'medicine' ? { lotNo: 'DEMO-LOT-1', expiryDate: expiry } : {}) })
  console.log(`created ${sku} ${name}`)
}
for (const [sku, name, unit, minStock, variants, categoryName, qty] of PPE) await upsert({ sku, name, type: 'ppe', categoryName, unit, minStock, variants, qty })
for (const [sku, name, unit, minStock, categoryName, qty, expiry] of MEDICINE) await upsert({ sku, name, type: 'medicine', categoryName, unit, minStock, variants: [''], qty, expiry })

for (const type of ['ppe', 'medicine']) {
  if (receipts[type].length === 0) continue
  must(await call('POST', '/api/inventory/receipts', { warehouseId: warehouseFor(type).id, lines: receipts[type], note: 'สต็อกตัวอย่าง' }), 'receipt')
  console.log(`received ${receipts[type].length} stock lines into ${warehouseFor(type).code}`)
}

// The first version of this script used two catch-all categories; drop them once they are empty.
const leftovers = must(await call('GET', '/api/inventory/categories'), 'categories').categories.filter((row) => LEGACY_CATEGORIES.includes(row.name) && row.itemCount === 0)
for (const row of leftovers) { await call('DELETE', `/api/inventory/categories/${row.id}`); console.log(`removed empty category ${row.name}`) }
// ---- sample stock counts: the PPE warehouse gets a posted count (with differences) and an open one ----
const existingCounts = must(await call('GET', `/api/inventory/counts?warehouseId=${ppeWarehouse.id}`), 'counts').counts
if (existingCounts.length === 0) {
  const first = must(await call('POST', '/api/inventory/counts', { warehouseId: ppeWarehouse.id }), 'create count').id
  const sheet = must(await call('GET', `/api/inventory/counts/${first}`), 'count sheet').count
  const diffs = new Map([[1, -2], [4, 1], [7, -1]])
  must(await call('PUT', `/api/inventory/counts/${first}/lines`, { lines: sheet.lines.map((line, index) => ({ variantId: line.variantId, lotId: line.lotId, countedQty: Math.max(line.systemQty + (diffs.get(index) ?? 0), 0) })) }), 'save count')
  const posted = must(await call('POST', `/api/inventory/counts/${first}/post`), 'post count')
  console.log(`stock count posted (${posted.adjustments} adjustments)`)
  const second = must(await call('POST', '/api/inventory/counts', { warehouseId: ppeWarehouse.id }), 'create second count').id
  const open = must(await call('GET', `/api/inventory/counts/${second}`), 'count sheet').count
  must(await call('PUT', `/api/inventory/counts/${second}/lines`, { lines: open.lines.slice(0, 6).map((line) => ({ variantId: line.variantId, lotId: line.lotId, countedQty: line.systemQty })) }), 'save open count')
  console.log('stock count left open (6 lines counted)')
}

// ---- sample requisitions: an employee asks, the admin approves/rejects, stock is issued ----
function caller() {
  let jar = ''
  return async (method, path, body) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar ? { Cookie: jar } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const set = response.headers.get('set-cookie')
    if (set) jar = set.split(';')[0]
    return { status: response.status, json: (response.headers.get('content-type') || '').includes('json') ? await response.json() : null }
  }
}
const SAMPLE_REASON = '[ตัวอย่าง]'
const known = must(await call('GET', '/api/requisitions/admin/all?pageSize=100'), 'requisitions').requisitions
if (!known.some((row) => String(row.reason ?? '').startsWith(SAMPLE_REASON))) {
  const randomPassword = () => `Demo-${Math.random().toString(36).slice(2, 8)}-${Math.floor(Math.random() * 90 + 10)}`
  const employeePassword = randomPassword()
  const code = 'DEMO-E01'
  await call('POST', '/api/admin/employees', { employeeCode: code, nameTh: 'สมชาย ตัวอย่าง', nameEn: '', positionTh: 'พนักงานผลิต', positionEn: '', departmentTh: 'ผลิต (ตัวอย่าง)', departmentEn: '' })
  const created = await call('POST', '/api/admin/users', { name: 'สมชาย ตัวอย่าง', employeeCode: code, password: employeePassword, role: 'employee' })
  if (created.status === 201) {
    console.log(`sample employee login: ${created.json.user.username} / ${employeePassword}`)
    const employee = caller()
    must(await employee('POST', '/api/auth/login', { username: created.json.user.username, password: employeePassword, rememberMe: false }), 'employee login')
    const all = must(await call('GET', '/api/inventory/items'), 'items').items
    const variantOf = (sku, label = '') => { const item = all.find((row) => row.sku === sku); return { variantId: item.variants.find((v) => v.label === label)?.id ?? item.variants[0].id, type: item.type } }
    const submit = async (lines, reason) => {
      for (const [sku, qty, label] of lines) { const v = variantOf(sku, label); must(await employee('PUT', '/api/requisitions/cart/lines', { type: v.type, variantId: v.variantId, qty }), `cart ${sku}`) }
      const type = variantOf(lines[0][0]).type
      return must(await employee('POST', '/api/requisitions/checkout', { type, warehouseId: warehouseFor(type).id, reason: `${SAMPLE_REASON} ${reason}`, neededBy: '' }), 'checkout').requisition.id
    }
    const approve = async (id) => must(await call('POST', `/api/requisitions/${id}/approve`, {}), 'approve')
    const issueAll = async (id) => {
      const detail = must(await call('GET', `/api/requisitions/${id}`), 'detail').requisition
      must(await call('POST', `/api/requisitions/${id}/issue`, { lines: detail.lines.map((line) => ({ lineId: line.id, qty: line.qtyApproved })) }), 'issue')
    }
    const issued = await submit([['DEMO-PPE-003', 10, 'M'], ['DEMO-PPE-001', 2]], 'เปลี่ยนอุปกรณ์เดิมที่ชำรุด')
    await approve(issued); await issueAll(issued)
    must(await employee('POST', `/api/requisitions/${issued}/receive`, {}), 'receive')
    const faceShield = await submit([['DEMO-PPE-008', 3]], 'งานเชื่อมประจำสัปดาห์')
    await approve(faceShield); await issueAll(faceShield)
    const waiting = await submit([['DEMO-MED-001', 5]], 'เติมตู้ยาประจำไลน์ผลิต')
    await approve(waiting)
    await submit([['DEMO-PPE-010', 20]], 'ฝุ่นในโรงงานเพิ่มขึ้น')
    const refused = await submit([['DEMO-PPE-006', 1, '41']], 'ขอรองเท้าคู่ใหม่')
    must(await call('POST', `/api/requisitions/${refused}/reject`, { reason: 'เพิ่งเบิกไปเมื่อเดือนที่แล้ว' }), 'reject')
    console.log('sample requisitions created: issued, issued, ready to issue, waiting for approval, rejected')
  } else console.log('sample employee already exists; skipped sample requisitions')
}

console.log('done')
