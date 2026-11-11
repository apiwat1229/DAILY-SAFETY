// Creates sample PPE and medicine items (with generated photos), a sample warehouse and starting stock.
// Safe to re-run: existing SKUs and the sample warehouse are skipped. Sample SKUs all start with "DEMO-".
//
//   SEED_URL=http://localhost:4000 SEED_USER=admin SEED_PASSWORD=... node scripts/seed-samples.mjs
import sharp from 'sharp'

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
        if (char === '' || char === '
') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('
'); return resolve(text) }
        if (char === '') process.exit(1)
        if (char === '' || char === '') text = text.slice(0, -1); else text += char
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

// ---- photos: simple vector icons on a tinted tile, rendered to JPEG ----
const ICONS = {
  helmet: '<path d="M110 300c0-100 55-170 130-170s130 70 130 170z" fill="#fff"/><rect x="80" y="300" width="320" height="34" rx="14" fill="#fff"/><rect x="226" y="120" width="28" height="170" fill="#0000001f"/>',
  glasses: '<rect x="80" y="190" width="140" height="100" rx="40" fill="#ffffffcc" stroke="#fff" stroke-width="12"/><rect x="260" y="190" width="140" height="100" rx="40" fill="#ffffffcc" stroke="#fff" stroke-width="12"/><path d="M220 225h40" stroke="#fff" stroke-width="14"/>',
  glove: '<path d="M150 380V220l-30-60c-8-18 14-30 26-14l30 46V90c0-18 28-18 28 0v100V70c0-18 28-18 28 0v120V82c0-18 28-18 28 0v120l12-60c4-18 30-12 26 6l-24 130c-8 40-20 56-20 56v10z" fill="#fff"/>',
  ear: '<path d="M170 380c-30-40-30-120 0-170 20-34 70-44 100-10 26 30 10 70-14 90-18 16-6 50-30 90z" fill="#fff"/><circle cx="262" cy="214" r="28" fill="#0000002e"/>',
  mask: '<path d="M90 190c60-26 240-26 300 0v110c-60 30-240 30-300 0z" fill="#fff"/><path d="M110 220h260M110 250h260M110 280h260" stroke="#0000002e" stroke-width="8"/><path d="M90 205c-30 0-50 20-50 50M390 205c30 0 50 20 50 50" stroke="#fff" stroke-width="10" fill="none"/>',
  boot: '<path d="M150 100h110v130l110 40c24 8 40 28 40 52v30H110z" fill="#fff"/><rect x="110" y="352" width="300" height="26" rx="8" fill="#0000002e"/>',
  vest: '<path d="M130 100l70 28 40 30 40-30 70-28 40 80-50 20v170H140V200l-50-20z" fill="#fff"/><path d="M165 270h150M165 320h150" stroke="#0000003a" stroke-width="22"/>',
  pill: '<g transform="rotate(-40 240 240)"><rect x="110" y="170" width="260" height="140" rx="70" fill="#fff"/><path d="M240 170v140" stroke="#0000002e" stroke-width="10"/><path d="M110 240a70 70 0 0 1 70-70h60v140h-60a70 70 0 0 1-70-70z" fill="#ffffff99"/></g>',
  bottle: '<rect x="190" y="90" width="100" height="56" rx="10" fill="#fff"/><path d="M165 160h150v200c0 12-10 22-22 22H187c-12 0-22-10-22-22z" fill="#fff"/><rect x="195" y="230" width="90" height="80" rx="8" fill="#0000002e"/>',
  plaster: '<g transform="rotate(-30 240 240)"><rect x="70" y="190" width="340" height="100" rx="50" fill="#fff"/><rect x="190" y="190" width="100" height="100" fill="#0000002e"/></g>',
  sachet: '<path d="M130 110h220l-14 270H144z" fill="#fff"/><path d="M130 110h220l-4 40H134z" fill="#0000002e"/><path d="M215 220h50M240 195v50" stroke="#0000003a" stroke-width="16"/>',
  tube: '<path d="M150 110h180l-20 220-20 60h-100l-20-60z" fill="#fff"/><rect x="190" y="70" width="100" height="44" rx="10" fill="#ffffffcc"/><path d="M180 200h120M180 250h120" stroke="#0000002e" stroke-width="12"/>',
}
async function photo(icon, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".72"/></linearGradient></defs><rect width="480" height="480" fill="url(#g)"/>${ICONS[icon]}</svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer()
}

const PPE = [
  ['DEMO-PPE-001', 'หมวกนิรภัย', 'ใบ', 20, [''], 'helmet', '#f59e0b', 80],
  ['DEMO-PPE-002', 'แว่นตานิรภัย', 'อัน', 30, [''], 'glasses', '#0ea5e9', 120],
  ['DEMO-PPE-003', 'ถุงมือผ้าเคลือบ', 'คู่', 100, ['S', 'M', 'L'], 'glove', '#16a34a', 200],
  ['DEMO-PPE-004', 'ที่อุดหู (ปลั๊กอุดหู)', 'คู่', 100, [''], 'ear', '#8b5cf6', 300],
  ['DEMO-PPE-005', 'หน้ากากอนามัย (กล่อง 50 ชิ้น)', 'กล่อง', 10, [''], 'mask', '#06b6d4', 40],
  ['DEMO-PPE-006', 'รองเท้านิรภัย', 'คู่', 5, ['39', '40', '41', '42', '43'], 'boot', '#78716c', 12],
  ['DEMO-PPE-007', 'เสื้อสะท้อนแสง', 'ตัว', 10, ['M', 'L', 'XL'], 'vest', '#ea580c', 30],
]
const MEDICINE = [
  ['DEMO-MED-001', 'พาราเซตามอล 500 มก. (แผง 10 เม็ด)', 'แผง', 20, 'pill', '#e11d48', 100, '2028-06-30'],
  ['DEMO-MED-002', 'แอลกอฮอล์ล้างแผล 70%', 'ขวด', 10, 'bottle', '#2563eb', 40, '2028-03-31'],
  ['DEMO-MED-003', 'พลาสเตอร์ปิดแผล (กล่อง 100 ชิ้น)', 'กล่อง', 10, 'plaster', '#d97706', 50, '2029-01-31'],
  ['DEMO-MED-004', 'เกลือแร่ ORS', 'ซอง', 30, 'sachet', '#0d9488', 150, '2027-12-31'],
  ['DEMO-MED-005', 'ครีมทาแผลไฟไหม้ น้ำร้อนลวก', 'หลอด', 5, 'tube', '#7c3aed', 25, '2027-09-30'],
]

must(await call('POST', '/api/auth/login', { username: user, password, rememberMe: false }), 'login')

const warehouses = must(await call('GET', '/api/inventory/warehouses'), 'warehouses').warehouses
let warehouse = warehouses.find((row) => row.code === 'SAMPLE')
if (!warehouse) warehouse = must(await call('POST', '/api/inventory/warehouses', { code: 'SAMPLE', name: 'คลังตัวอย่าง' }), 'create warehouse').warehouse
console.log(`warehouse ${warehouse.code} (${warehouse.id})`)

async function category(name, type) {
  const rows = must(await call('GET', '/api/inventory/categories'), 'categories').categories
  const found = rows.find((row) => row.name === name && row.type === type)
  return found ?? must(await call('POST', '/api/inventory/categories', { name, type, sortOrder: 0 }), 'create category').category
}
const ppeCategory = await category('อุปกรณ์ป้องกัน (ตัวอย่าง)', 'ppe')
const medCategory = await category('ยาสามัญประจำบ้าน (ตัวอย่าง)', 'medicine')

const existing = new Set(must(await call('GET', '/api/inventory/items'), 'items').items.map((row) => row.sku))
const receipts = []
async function create({ sku, name, type, categoryId, unit, minStock, variants, icon, color, qty, expiry }) {
  if (existing.has(sku)) { console.log(`skip ${sku} (exists)`); return }
  const item = must(await call('POST', '/api/inventory/items', { sku, name, type, categoryId, unit, minStock, variants }), `create ${sku}`).item
  const form = new FormData()
  form.append('image', new Blob([await photo(icon, color)], { type: 'image/jpeg' }), `${sku}.jpg`)
  must(await call('POST', `/api/inventory/items/${item.id}/image`, undefined, form), `photo ${sku}`)
  for (const variant of item.variants) receipts.push({ variantId: variant.id, qty, ...(type === 'medicine' ? { lotNo: 'DEMO-LOT-1', expiryDate: expiry } : {}) })
  console.log(`created ${sku} ${name}`)
}
for (const [sku, name, unit, minStock, variants, icon, color, qty] of PPE) await create({ sku, name, type: 'ppe', categoryId: ppeCategory.id, unit, minStock, variants, icon, color, qty })
for (const [sku, name, unit, minStock, icon, color, qty, expiry] of MEDICINE) await create({ sku, name, type: 'medicine', categoryId: medCategory.id, unit, minStock, variants: [''], icon, color, qty, expiry })

if (receipts.length) {
  must(await call('POST', '/api/inventory/receipts', { warehouseId: warehouse.id, lines: receipts, note: 'สต็อกตัวอย่าง' }), 'receipt')
  console.log(`received ${receipts.length} stock lines into ${warehouse.code}`)
}
console.log('done')
