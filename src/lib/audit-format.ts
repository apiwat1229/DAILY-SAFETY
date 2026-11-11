// Turns raw audit-log rows (internal type names, UUIDs, JSON) into text a person can read.
import type { AuditEntry } from '@/lib/types'

/** Plain-language name of the thing an entry is about. */
export const targetLabels: Record<string, string> = {
  inspection: 'รายการตรวจ',
  response: 'หัวข้อตรวจ / งานแก้ไข',
  attachment: 'รูปภาพแนบ',
  user: 'บัญชีผู้ใช้',
  employee: 'ข้อมูลพนักงาน',
  checklist: 'หัวข้อตรวจ',
  assessment: 'แบบประเมิน',
  assessment_submission: 'ผลแบบประเมิน',
  training_material: 'สื่ออบรม',
  hiyari_form: 'ฟอร์ม Hiyari Hat',
  hiyari_submission: 'รายงาน Hiyari Hat',
  inventory_item: 'สินค้า', inventory_category: 'หมวดสินค้า', inventory_warehouse: 'คลังสินค้า', inventory_stock: 'สต็อกสินค้า',
  inventory_count: 'ใบนับสต็อก', inventory_settings: 'ตั้งค่าคลังสินค้า',
}

export function targetLabel(type: string) { return targetLabels[type] ?? type }

const fieldLabels: Record<string, string> = {
  title: 'ชื่อ', item: 'หัวข้อ', name: 'ชื่อ', nameTh: 'ชื่อ (ไทย)', nameEn: 'ชื่อ (อังกฤษ)', username: 'บัญชี', employeeCode: 'รหัสพนักงาน',
  previousCode: 'รหัสเดิม', role: 'สิทธิ์', area: 'พื้นที่', shift: 'กะ', inspector: 'ผู้ตรวจ', date: 'วันที่', time: 'เวลา', status: 'สถานะ',
  result: 'ผลตรวจ', issueDetails: 'รายละเอียดปัญหา', responsible: 'ผู้รับผิดชอบ', followUpStatus: 'สถานะการแก้ไข', dueDate: 'กำหนดเสร็จ',
  photoCount: 'จำนวนรูป', addedPhotos: 'รูปที่เพิ่ม', removedPhotos: 'รูปที่ลบ', deletedSubmissions: 'ผลคำตอบที่ถูกลบ', deletedViews: 'ประวัติอ่านที่ถูกลบ',
  imported: 'นำเข้า', created: 'เพิ่มใหม่', updated: 'อัปเดต', type: 'ประเภท', reportDate: 'วันที่รายงาน', inspectionId: 'รหัสรายการตรวจ', responseId: 'รหัสหัวข้อ',
}
const roleLabels: Record<string, string> = { admin: 'ผู้ดูแลระบบ', leader: 'หัวหน้างาน', employee: 'พนักงาน', storekeeper: 'เจ้าหน้าที่คลัง' }
const statusLabels: Record<string, string> = { received: 'รับเรื่อง', in_progress: 'กำลังแก้ไข', closed: 'ปิดแล้ว', before: 'ก่อนแก้ไข', after: 'หลังแก้ไข' }
const groupLabels: Record<string, string> = { before: 'ก่อน', after: 'หลัง' }
/** Technical identifiers are kept out of the readable summary. */
const hiddenInSummary = new Set(['inspectionId', 'responseId', 'type'])
const summaryOrder = ['title', 'item', 'name', 'nameTh', 'username', 'area', 'shift', 'inspector', 'followUpStatus', 'status', 'result', 'employeeCode', 'date']

export type DetailRow = { label: string; value: string }

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่'
  if (Array.isArray(value)) return value.map((item) => formatValue(key, item)).join(', ')
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${fieldLabels[k] ?? k}: ${formatValue(k, v)}`).join(' · ')
  const text = String(value)
  if (key === 'role') return roleLabels[text] ?? text
  if (key === 'status' || key === 'type') return statusLabels[text] ?? text
  return text
}

/** Every detail as a "label → value" row; nested before/after objects become "ก่อน · พื้นที่" style rows. */
export function detailRows(details: Record<string, unknown>, prefix = ''): DetailRow[] {
  const rows: DetailRow[] = []
  for (const [key, value] of Object.entries(details)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...detailRows(value as Record<string, unknown>, groupLabels[key] ?? fieldLabels[key] ?? key))
      continue
    }
    const label = fieldLabels[key] ?? key
    rows.push({ label: prefix ? `${prefix} · ${label}` : label, value: formatValue(key, value) })
  }
  return rows
}

/** One short line describing what the entry is about, e.g. "พื้นที่: Lab · กะ: ดึก". */
export function summarize(entry: AuditEntry): string {
  const flat: Record<string, unknown> = {}
  const collect = (source: Record<string, unknown>, skipNested: boolean) => {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) { if (!skipNested && key === 'after') collect(value as Record<string, unknown>, true); continue }
      if (!(key in flat) && value !== '' && value !== null && value !== undefined) flat[key] = value
    }
  }
  collect(entry.details, false)
  const keys = [...summaryOrder.filter((key) => key in flat), ...Object.keys(flat).filter((key) => !summaryOrder.includes(key))].filter((key) => !hiddenInSummary.has(key))
  return keys.slice(0, 3).map((key) => `${fieldLabels[key] ?? key}: ${formatValue(key, flat[key])}`).join(' · ')
}

export type ActionKind = 'create' | 'update' | 'delete' | 'other'

/** Colour/icon category derived from the (Thai) action text. */
export function actionKind(action: string): ActionKind {
  if (action.includes('ลบ')) return 'delete'
  if (/เพิ่ม|สร้าง|นำเข้า/.test(action)) return 'create'
  if (/แก้ไข|อัปเดต|เปลี่ยน|เปิด|ปิด|ตั้ง/.test(action)) return 'update'
  return 'other'
}
