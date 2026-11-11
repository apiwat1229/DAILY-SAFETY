// Creates sample PPE and medicine items in every category, with real photos (scripts/sample-photos), a sample warehouse and stock.
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
let warehouse = warehouses.find((row) => row.code === 'SAMPLE')
if (!warehouse) warehouse = must(await call('POST', '/api/inventory/warehouses', { code: 'SAMPLE', name: 'คลังตัวอย่าง' }), 'create warehouse').warehouse
console.log(`warehouse ${warehouse.code} (${warehouse.id})`)

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
const receipts = []
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
  for (const variant of item.variants) receipts.push({ variantId: variant.id, qty, ...(type === 'medicine' ? { lotNo: 'DEMO-LOT-1', expiryDate: expiry } : {}) })
  console.log(`created ${sku} ${name}`)
}
for (const [sku, name, unit, minStock, variants, categoryName, qty] of PPE) await upsert({ sku, name, type: 'ppe', categoryName, unit, minStock, variants, qty })
for (const [sku, name, unit, minStock, categoryName, qty, expiry] of MEDICINE) await upsert({ sku, name, type: 'medicine', categoryName, unit, minStock, variants: [''], qty, expiry })

if (receipts.length) {
  must(await call('POST', '/api/inventory/receipts', { warehouseId: warehouse.id, lines: receipts, note: 'สต็อกตัวอย่าง' }), 'receipt')
  console.log(`received ${receipts.length} stock lines into ${warehouse.code}`)
}

// The first version of this script used two catch-all categories; drop them once they are empty.
const leftovers = must(await call('GET', '/api/inventory/categories'), 'categories').categories.filter((row) => LEGACY_CATEGORIES.includes(row.name) && row.itemCount === 0)
for (const row of leftovers) { await call('DELETE', `/api/inventory/categories/${row.id}`); console.log(`removed empty category ${row.name}`) }
console.log('done')
