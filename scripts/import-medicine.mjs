// Imports the medicine / first-aid purchase list (Excel) as items with photos and starting stock.
//
//   node scripts/import-medicine.mjs "C:/path/รายการสั่งซื้อยา.xlsx" --dry-run     (only shows what would be created)
//   SEED_URL=https://safety-checklist.ytrc.co.th node scripts/import-medicine.mjs "C:/path/รายการสั่งซื้อยา.xlsx"
//
// The file has no lot numbers or expiry dates, so every item is received with a temporary lot and expiry (see below)
// that should be corrected from the real packaging. Items that already exist (same SKU) are skipped, so it is safe to re-run.
import ExcelJS from 'exceljs'

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const dryRun = process.argv.includes('--dry-run')
if (!file) { console.error('Usage: node scripts/import-medicine.mjs <file.xlsx> [--dry-run]'); process.exit(1) }

const WAREHOUSE = { code: 'MED', name: 'คลังยาและเวชภัณฑ์', type: 'medicine' }
const TEMP_LOT = 'PO-ต.ค.68-ชั่วคราว'
const TEMP_EXPIRY = '2027-12-31' // 31 ธ.ค. 2570: placeholder agreed with the owner; replace with the real date later
const SKU_PREFIX = 'MED-'

// ---- read the workbook ----
const cell = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return String(value.result ?? value.text ?? (value.richText ? value.richText.map((part) => part.text).join('') : '')).trim()
  return String(value).trim()
}
const clean = (text) => cell(text).replace(/\s+/g, ' ').trim()

function parseQuantity(raw, size) {
  const match = clean(raw).match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (!match) return null
  let unit = match[2].replace(/ผื่น/g, 'ผืน').trim()
  if (!unit) unit = /\b(ml|cc)\b|มล/i.test(size) ? 'ขวด' : /\bg\b|กรัม/i.test(size) ? 'หลอด' : 'ชิ้น'
  return { qty: Number(match[1]), unit }
}

const CATEGORY_RULES = [
  [/ขี้ผึ้งป้ายตา|ยาหยอดตา|น้ำกรดบอริค/, 'ยาตา'],
  [/ยาบรรเทาปวดลดไข้/, 'ยาแก้ปวดลดไข้'],
  [/ยาแก้แพ้/, 'ยาแก้แพ้'],
  [/ยาธาตุ|เกลือแร่|ยาลดกรด/, 'ยาน้ำและระบบทางเดินอาหาร'],
  [/ไอโอดีน|แอลกอฮอล์|ฟอกแผล/, 'น้ำยาล้างแผลและฆ่าเชื้อ'],
  [/น้ำมันมวย|เคาเตอร์เพน|ขี้ผึ้ง|ผดผื่น|น้ำร้อนลวก/, 'ยาใช้ภายนอก'],
  [/แอมโมเนีย/, 'ยาสามัญอื่น ๆ'],
]
const categoryOf = (name) => CATEGORY_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? 'อุปกรณ์ปฐมพยาบาล'

async function readItems() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const merged = new Map()
  // Sheets are listed newest first; read the oldest first so the newer sheet overrides a repeated item.
  for (const sheet of [...workbook.worksheets].reverse()) {
    const photos = new Map(sheet.getImages().map((image) => [image.range.tl.nativeRow + 1, image.imageId]))
    sheet.eachRow((row, rowNumber) => {
      const name = clean(row.getCell(2).value)
      const quantity = parseQuantity(row.getCell(5).value, clean(row.getCell(4).value))
      if (!name || name === 'ชื่อยา' || !quantity) return
      const size = clean(row.getCell(4).value)
      const image = photos.has(rowNumber) ? workbook.getImage(photos.get(rowNumber)) : null
      const previous = merged.get(name)
      merged.set(name, { name, size, ...quantity, image: image ?? previous?.image ?? null })
    })
  }
  return [...merged.values()].map((item, index) => {
    const full = `${item.name}${item.size ? ` ${item.size}` : ''}`
    return { ...item, sku: `${SKU_PREFIX}${String(index + 1).padStart(3, '0')}`, title: full.length > 120 ? `${full.slice(0, 117)}…` : full, category: categoryOf(item.name) }
  })
}

const items = await readItems()
console.log(`${items.length} items from ${file}`)
for (const item of items) console.log(`${item.sku}  ${item.category.padEnd(26)} ${String(item.qty).padStart(4)} ${item.unit.padEnd(6)} ${item.image ? '📷' : '  '} ${item.title}`)
if (dryRun) { console.log('\nDry run: nothing was created.'); process.exit(0) }

// ---- sign in and create everything through the app's own API ----
const base = (process.env.SEED_URL || 'http://localhost:4000').replace(/\/$/, '')
const user = process.env.SEED_USER || 'admin'
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
let cookie = ''
async function call(method, path, body, form) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) })
  const set = response.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  return { status: response.status, json: (response.headers.get('content-type') || '').includes('json') ? await response.json() : null }
}
const must = (result, label) => { if (result.status >= 300) throw new Error(`${label}: ${result.status} ${JSON.stringify(result.json)}`); return result.json }

must(await call('POST', '/api/auth/login', { username: user, password: await askPassword(), rememberMe: false }), 'login')

const warehouses = must(await call('GET', '/api/inventory/warehouses'), 'warehouses').warehouses
const warehouse = warehouses.find((row) => row.code === WAREHOUSE.code) ?? must(await call('POST', '/api/inventory/warehouses', WAREHOUSE), 'create warehouse').warehouse
console.log(`warehouse ${warehouse.code} ${warehouse.name}`)

const categoryIds = new Map(must(await call('GET', '/api/inventory/categories'), 'categories').categories.filter((row) => row.type === 'medicine').map((row) => [row.name, row.id]))
for (const name of new Set(items.map((item) => item.category))) {
  if (!categoryIds.has(name)) categoryIds.set(name, must(await call('POST', '/api/inventory/categories', { name, type: 'medicine', sortOrder: categoryIds.size }), `create category ${name}`).category.id)
}

const existing = new Set(must(await call('GET', '/api/inventory/items'), 'items').items.map((row) => row.sku))
const lines = []
for (const item of items) {
  if (existing.has(item.sku)) { console.log(`skip ${item.sku} (exists)`); continue }
  const created = must(await call('POST', '/api/inventory/items', { sku: item.sku, name: item.title, type: 'medicine', categoryId: categoryIds.get(item.category), unit: item.unit, minStock: 0, variants: [''] }), `create ${item.sku}`).item
  if (item.image) {
    const form = new FormData()
    form.append('image', new Blob([item.image.buffer], { type: item.image.extension === 'png' ? 'image/png' : 'image/jpeg' }), `${item.sku}.${item.image.extension}`)
    must(await call('POST', `/api/inventory/items/${created.id}/image`, undefined, form), `photo ${item.sku}`)
  }
  lines.push({ variantId: created.variants[0].id, qty: item.qty, lotNo: TEMP_LOT, expiryDate: TEMP_EXPIRY })
  console.log(`created ${item.sku} ${item.title}`)
}
if (lines.length) {
  must(await call('POST', '/api/inventory/receipts', { warehouseId: warehouse.id, lines, note: 'รับเข้าตามใบสั่งซื้อยา (วันหมดอายุชั่วคราว รอตรวจจริง)' }), 'receipt')
  console.log(`received ${lines.length} stock lines into ${warehouse.code} (temporary lot ${TEMP_LOT}, expiry ${TEMP_EXPIRY})`)
}
console.log('done')
