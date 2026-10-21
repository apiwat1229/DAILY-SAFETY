import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { CHECKLIST, FOLLOW_UP_STATUSES, RESULTS } from './checklist.js'
import { createHiyariWorkbook } from './hiyari-export.js'
import { createHiyariEmployeeSummaryWorkbook } from './hiyari-summary-export.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(root, '..')
const dataDir = path.join(appRoot, 'data')
const uploadDir = path.join(dataDir, 'uploads')
const trainingUploadDir = path.join(uploadDir, 'training')
const hiyariUploadDir = path.join(uploadDir, 'hiyari')
const dbPath = path.join(dataDir, 'daily-safety.sqlite')
const port = Number(process.env.PORT || 4000)
const host = process.env.HOST || '127.0.0.1'
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD || !process.env.LEADER_PASSWORD)) {
  throw new Error('Production requires SESSION_SECRET, ADMIN_PASSWORD, and LEADER_PASSWORD environment variables.')
}

await Promise.all([mkdir(trainingUploadDir, { recursive: true }), mkdir(hiyariUploadDir, { recursive: true })])

const db = new DatabaseSync(dbPath)
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    employee_code TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('admin', 'leader', 'employee')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    inspection_date TEXT NOT NULL,
    inspection_time TEXT NOT NULL DEFAULT '',
    inspector_id TEXT NOT NULL REFERENCES users(id),
    inspector_name TEXT NOT NULL,
    employee_code TEXT NOT NULL DEFAULT '',
    department_area TEXT NOT NULL,
    shift TEXT NOT NULL,
    created_at TEXT NOT NULL,
    submitted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    item_title TEXT NOT NULL,
    item_description TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('OK', 'NG', 'N/A')),
    issue_details TEXT NOT NULL DEFAULT '',
    responsible TEXT NOT NULL DEFAULT '',
    responsible_user_id TEXT NOT NULL DEFAULT '',
    follow_up_status TEXT NOT NULL DEFAULT 'ไม่เกี่ยวข้อง',
    due_date TEXT NOT NULL DEFAULT '',
    resolution_note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(inspection_id, item_key)
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    attachment_type TEXT NOT NULL CHECK(attachment_type IN ('before', 'after')),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    uploaded_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    session_data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checklist_items (
    item_key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    choices_json TEXT NOT NULL DEFAULT '["OK","NG","N/A"]',
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS employee_directory (
    employee_code TEXT PRIMARY KEY,
    name_th TEXT NOT NULL DEFAULT '',
    name_en TEXT NOT NULL DEFAULT '',
    position_th TEXT NOT NULL DEFAULT '',
    position_en TEXT NOT NULL DEFAULT '',
    department_th TEXT NOT NULL DEFAULT '',
    department_en TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    public_token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0, 1)),
    allow_multiple_attempts INTEGER NOT NULL DEFAULT 0 CHECK(allow_multiple_attempts IN (0, 1)),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assessment_questions (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK(question_type IN ('choice', 'text')),
    options_json TEXT NOT NULL DEFAULT '[]',
    correct_option INTEGER,
    is_required INTEGER NOT NULL DEFAULT 1 CHECK(is_required IN (0, 1)),
    order_index INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assessment_submissions (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    answers_json TEXT NOT NULL DEFAULT '[]',
    score INTEGER NOT NULL DEFAULT 0,
    max_score INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS training_materials (
    id TEXT PRIMARY KEY,
    public_token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    companion_original_name TEXT NOT NULL DEFAULT '',
    companion_stored_name TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS training_views (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES training_materials(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    UNIQUE(material_id, employee_code)
  );
  CREATE TABLE IF NOT EXISTS hiyari_forms (
    id TEXT PRIMARY KEY,
    public_token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS hiyari_submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL REFERENCES hiyari_forms(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL CHECK(language IN ('th', 'en', 'my')),
    report_date TEXT NOT NULL,
    when_text TEXT NOT NULL,
    where_text TEXT NOT NULL,
    what_happened TEXT NOT NULL,
    suggestions TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(inspection_date);
  CREATE INDEX IF NOT EXISTS idx_responses_inspection ON responses(inspection_id);
  CREATE INDEX IF NOT EXISTS idx_responses_result_status ON responses(result, follow_up_status);
  CREATE INDEX IF NOT EXISTS idx_attachments_response ON attachments(response_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_employee_directory_th_name ON employee_directory(name_th COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_employee_directory_en_name ON employee_directory(name_en COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_assessment_questions_parent ON assessment_questions(assessment_id, order_index);
  CREATE INDEX IF NOT EXISTS idx_assessment_submissions_parent ON assessment_submissions(assessment_id, submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_assessment_submissions_employee ON assessment_submissions(employee_code);
  CREATE INDEX IF NOT EXISTS idx_training_views_employee ON training_views(employee_code, viewed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hiyari_submissions_form ON hiyari_submissions(form_id, submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hiyari_submissions_employee ON hiyari_submissions(employee_code, submitted_at DESC);
`)

const hiyariSubmissionColumns = db.prepare('PRAGMA table_info(hiyari_submissions)').all()
if (!hiyariSubmissionColumns.some((column) => column.name === 'photos_json')) {
  db.exec("ALTER TABLE hiyari_submissions ADD COLUMN photos_json TEXT NOT NULL DEFAULT '[]'")
}

const trainingMaterialColumns = db.prepare('PRAGMA table_info(training_materials)').all()
if (!trainingMaterialColumns.some((column) => column.name === 'companion_original_name')) {
  db.exec("ALTER TABLE training_materials ADD COLUMN companion_original_name TEXT NOT NULL DEFAULT ''")
}
if (!trainingMaterialColumns.some((column) => column.name === 'companion_stored_name')) {
  db.exec("ALTER TABLE training_materials ADD COLUMN companion_stored_name TEXT NOT NULL DEFAULT ''")
}

const checklistColumns = db.prepare('PRAGMA table_info(checklist_items)').all()
if (!checklistColumns.some((column) => column.name === 'choices_json')) {
  db.exec(`ALTER TABLE checklist_items ADD COLUMN choices_json TEXT NOT NULL DEFAULT '["OK","NG","N/A"]'`)
}

const inspectionColumns = db.prepare('PRAGMA table_info(inspections)').all()
if (!inspectionColumns.some((column) => column.name === 'inspection_time')) {
  db.exec("ALTER TABLE inspections ADD COLUMN inspection_time TEXT NOT NULL DEFAULT ''")
}
const responseColumns = db.prepare('PRAGMA table_info(responses)').all()
if (!responseColumns.some((column) => column.name === 'responsible_user_id')) {
  db.exec("ALTER TABLE responses ADD COLUMN responsible_user_id TEXT NOT NULL DEFAULT ''")
}
const userColumns = db.prepare('PRAGMA table_info(users)').all()
if (!userColumns.some((column) => column.name === 'is_active')) {
  db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))')
}
const usersSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || ''
if (!usersSchema.includes("'employee'")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    CREATE TABLE users_rebuild (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      employee_code TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('admin', 'leader', 'employee')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at TEXT NOT NULL
    );
    INSERT INTO users_rebuild (id, username, password_hash, display_name, employee_code, role, is_active, created_at)
      SELECT id, username, password_hash, display_name, employee_code, role, is_active, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_rebuild RENAME TO users;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `)
}

const checklistCount = db.prepare('SELECT COUNT(*) AS count FROM checklist_items').get().count
if (!checklistCount) {
  const seedChecklistItem = db.prepare(`INSERT INTO checklist_items
    (item_key, title, description, order_index, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)`)
  const seededAt = new Date().toISOString()
  for (const item of CHECKLIST) seedChecklistItem.run(item.key, item.title, item.description, item.order, seededAt, seededAt)
}

class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super()
    this.database = database
  }

  get(id, callback) {
    try {
      const row = this.database.prepare('SELECT session_data, expires_at FROM sessions WHERE session_id = ?').get(id)
      if (!row || row.expires_at <= Date.now()) {
        if (row) this.database.prepare('DELETE FROM sessions WHERE session_id = ?').run(id)
        return callback(null, null)
      }
      callback(null, JSON.parse(row.session_data))
    } catch (error) { callback(error) }
  }

  set(id, value, callback) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + (value.cookie?.originalMaxAge || 36_000_000)
      this.database.prepare(`INSERT INTO sessions (session_id, session_data, expires_at) VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET session_data = excluded.session_data, expires_at = excluded.expires_at`)
        .run(id, JSON.stringify(value), expires)
      if (callback) callback(null)
    } catch (error) { if (callback) callback(error) }
  }

  touch(id, value, callback) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + (value.cookie?.originalMaxAge || 36_000_000)
      this.database.prepare('UPDATE sessions SET expires_at = ? WHERE session_id = ?').run(expires, id)
      if (callback) callback(null)
    } catch (error) { if (callback) callback(error) }
  }

  destroy(id, callback) {
    try {
      this.database.prepare('DELETE FROM sessions WHERE session_id = ?').run(id)
      if (callback) callback(null)
    } catch (error) { if (callback) callback(error) }
  }
}

const nowIso = () => new Date().toISOString()

async function seedUser({ username, password, displayName, employeeCode, role }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    const envPassword = role === 'admin' ? process.env.ADMIN_PASSWORD : process.env.LEADER_PASSWORD
    if (envPassword) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(envPassword, 10), existing.id)
    return
  }
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, employee_code, role, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), username, await bcrypt.hash(password, 10), displayName, employeeCode, role, nowIso())
}

await seedUser({
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Admin@123',
  displayName: 'ผู้ดูแลระบบ',
  employeeCode: 'ADMIN',
  role: 'admin',
})
await seedUser({
  username: process.env.LEADER_USERNAME || 'leader',
  password: process.env.LEADER_PASSWORD || 'Leader@123',
  displayName: 'หัวหน้างานตัวอย่าง',
  employeeCode: 'LEADER-01',
  role: 'leader',
})

db.prepare("INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('sample_safety_content_seeded', '0')").run()
if (db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'sample_safety_content_seeded'").get()?.setting_value !== '1') {
  const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at LIMIT 1").get()?.id
  if (!adminId) throw new Error('Cannot add sample safety content without an active administrator account.')
  const timestamp = nowIso()
  const assessmentId = 'sample-safety-basics-v1'
  const sampleQuestions = [
    ['ถุงมือป้องกันบาดมีรอยฉีกก่อนเริ่มงาน ควรทำอย่างไร?', ['ใช้ต่อจนกว่าจะจบกะ', 'เปลี่ยนเป็นถุงมือที่สมบูรณ์ก่อนเริ่มงาน', 'พันเทปปิดรอยฉีก', 'ถอดถุงมือแล้วทำงานต่อ'], 1],
    ['เมื่อต้องทำความสะอาดเครื่องจักรที่ยังมีพลังงาน ควรทำอย่างไรเป็นอันดับแรก?', ['รีบเช็ดเฉพาะจุดที่เข้าถึงได้', 'หยุดเครื่อง แยกพลังงาน ล็อกและติดป้าย พร้อมตรวจยืนยัน', 'ขอให้เพื่อนคอยกดปุ่มหยุด', 'ใส่ถุงมือหนาขึ้นแล้วเริ่มงาน'], 1],
    ['พบฝาครอบเครื่องจักรหลวมระหว่างเดินเครื่อง ควรทำอย่างไร?', ['หยุดเครื่องและแจ้งผู้รับผิดชอบ', 'ใช้มือดันฝาครอบกลับเข้าที่', 'ทำงานต่อโดยเพิ่มความระมัดระวัง', 'ถอดฝาครอบออกเพื่อไม่ให้สั่น'], 0],
    ['พบภาชนะสารเคมีไม่มีฉลาก ควรทำอย่างไร?', ['ดมกลิ่นเพื่อระบุชนิด', 'ย้ายไปเทรวมกับสารที่คล้ายกัน', 'หยุดใช้ แยกพื้นที่ และแจ้งหัวหน้างานเพื่อระบุสารอย่างปลอดภัย', 'เปิดฝาทิ้งไว้ให้กลิ่นจาง'], 2],
    ['หากสารเคมีกระเด็นเข้าตา ควรทำอย่างไร?', ['ขยี้ตาแล้วกลับไปทำงาน', 'ล้างตาทันทีที่จุดล้างตาตามขั้นตอน และขอความช่วยเหลือ', 'เช็ดด้วยผ้าแห้ง', 'รอให้หายระคายเคืองเอง'], 1],
    ['ทางเดินมีน้ำมันหกและยังไม่ได้ทำความสะอาด ควรทำอย่างไร?', ['เดินอ้อมโดยไม่ต้องแจ้งใคร', 'กั้นหรือเตือนพื้นที่ แจ้งผู้รับผิดชอบ และทำความสะอาดตามวิธีที่ปลอดภัย', 'โรยกระดาษแล้วเดินผ่าน', 'รอให้แห้งเอง'], 1],
    ['เมื่อต้องยกของหนักด้วยมือ ควรเริ่มจากข้อใด?', ['ประเมินน้ำหนักและเส้นทาง ใช้อุปกรณ์ช่วยหรือขอคนช่วยเมื่อจำเป็น', 'ก้มหลังแล้วยกให้เร็วที่สุด', 'บิดลำตัวขณะยกเพื่อประหยัดเวลา', 'ยกของให้ห่างจากลำตัว'], 0],
    ['คนเดินเท้าควรปฏิบัติอย่างไรเมื่ออยู่ใกล้รถยก?', ['เดินตัดหน้ารถเพื่อให้ผู้ขับเห็น', 'ใช้ทางเดินหรือทางข้ามที่กำหนด และรอจนผู้ขับรับรู้', 'เดินหลังรถยกขณะถอย', 'ยืนใต้ของที่รถยกกำลังยก'], 1],
    ['วิธีใช้ถังดับเพลิงเบื้องต้นที่ถูกต้องคือข้อใด?', ['ดึงสลัก เล็งที่ฐานไฟ บีบคันบีบ และกวาดหัวฉีด', 'เล็งที่เปลวไฟด้านบนแล้วฉีดต่อเนื่อง', 'เขย่าถังแล้วเปิดฝาทิ้งไว้', 'เข้าใกล้ไฟให้มากที่สุดก่อนฉีด'], 0],
    ['หากพบผู้ถูกไฟฟ้าดูด ควรช่วยอย่างไรเป็นอันดับแรก?', ['จับตัวผู้ประสบเหตุแล้วดึงออกทันที', 'ตัดแหล่งจ่ายไฟโดยไม่สัมผัสตัวผู้ประสบเหตุ และเรียกทีมช่วยเหลือ', 'สาดน้ำเพื่อให้ผู้ประสบเหตุฟื้น', 'ใช้โลหะเขี่ยสายไฟ'], 1],
    ['ก่อนเริ่มงานเชื่อม ควรทำสิ่งใด?', ['เริ่มงานทันทีถ้ามีหน้ากากเชื่อม', 'ขออนุญาตงานร้อน เคลียร์เชื้อเพลิง เตรียมถังดับเพลิงและผู้เฝ้าระวัง', 'เปิดประตูไว้เพียงอย่างเดียว', 'ให้เพื่อนยืนดูห่าง ๆ โดยไม่ต้องเตรียมอุปกรณ์'], 1],
    ['ก่อนเข้าทำงานในที่อับอากาศต้องมีอะไร?', ['เพื่อนร่วมงานหนึ่งคนยืนใกล้ทางเข้า', 'ใบอนุญาต ตรวจวัดบรรยากาศ ผู้เฝ้าระวัง และแผนช่วยเหลือ', 'หน้ากากผ้าทั่วไป', 'ทำงานให้เสร็จภายในห้านาที'], 1],
    ['เหตุเกือบเกิดอุบัติเหตุแต่ไม่มีผู้บาดเจ็บ ควรทำอย่างไร?', ['ไม่ต้องรายงานเพราะไม่มีความเสียหาย', 'รายงานหัวหน้างานเพื่อแก้สาเหตุและป้องกันการเกิดซ้ำ', 'เล่าให้เพื่อนฟังหลังเลิกงาน', 'รอให้เกิดเหตุซ้ำก่อน'], 1],
    ['หลังล็อกและติดป้ายแยกพลังงานแล้ว ควรทำอะไรต่อก่อนซ่อม?', ['ตรวจยืนยันว่าเครื่องไม่สามารถเริ่มทำงานและไม่มีพลังงานค้าง', 'ถอดป้ายออกเพื่อให้เห็นชัด', 'ฝากกุญแจไว้กับเพื่อนแล้วเริ่มซ่อม', 'ทดลองหมุนชิ้นส่วนด้วยมือ'], 0],
    ['หากทำงานในพื้นที่เสียงดัง ควรปฏิบัติอย่างไร?', ['ใช้ที่อุดหูหรือครอบหูตามข้อกำหนดของพื้นที่', 'เพิ่มเสียงวิทยุเพื่อกลบเสียงเครื่องจักร', 'ถอดอุปกรณ์ป้องกันเป็นช่วง ๆ', 'อยู่ใกล้แหล่งเสียงให้น้อยลงโดยไม่ต้องแจ้งหัวหน้า'], 0],
    ['ควรทิ้งผ้าเปื้อนสารเคมีที่ใด?', ['ถังขยะทั่วไป', 'ภาชนะของเสียอันตรายที่กำหนดและติดป้าย', 'ท่อระบายน้ำ', 'วางไว้ข้างเครื่องจักร'], 1],
    ['เมื่อได้กลิ่นควันและสัญญาณเตือนดัง ควรทำอย่างไร?', ['เก็บของส่วนตัวก่อน', 'อพยพตามเส้นทางไปจุดรวมพลและรอคำสั่ง', 'ใช้ลิฟต์ลงชั้นล่าง', 'กลับไปตรวจหาต้นเหตุด้วยตนเอง'], 1],
    ['หากไม่แน่ใจวิธีทำงานหรือพบสภาพไม่ปลอดภัย ควรทำอย่างไร?', ['หยุดงานและสอบถามหัวหน้างานก่อนทำต่อ', 'ทดลองทำอย่างช้า ๆ', 'ทำตามที่เคยเห็นโดยไม่ต้องถาม', 'ให้เพื่อนรับผิดชอบแทน'], 0],
  ]
  const existingAssessment = db.prepare('SELECT id FROM assessments WHERE id = ?').get(assessmentId)
  if (!existingAssessment) {
    db.prepare(`INSERT INTO assessments
      (id, public_token, title, description, instructions, is_published, allow_multiple_attempts, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`)
      .run(assessmentId, newPublicToken(), 'แบบประเมินความรู้ความปลอดภัยพื้นฐาน', 'ทบทวนความรู้เรื่อง PPE เครื่องจักร สารเคมี การยกเคลื่อนย้าย และเหตุฉุกเฉิน', 'เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว แบบประเมินนี้มี 18 ข้อ และส่งคำตอบได้หนึ่งครั้งต่อรหัสพนักงาน', adminId, timestamp, timestamp)
    const insertQuestion = db.prepare(`INSERT INTO assessment_questions
      (id, assessment_id, prompt, question_type, options_json, correct_option, is_required, order_index)
      VALUES (?, ?, ?, 'choice', ?, ?, 1, ?)`)
    sampleQuestions.forEach(([prompt, options, correctOption], index) => insertQuestion.run(randomUUID(), assessmentId, prompt, JSON.stringify(options), correctOption, index + 1))
  }

  const trainingId = 'sample-safety-training-v1'
  if (!db.prepare('SELECT id FROM training_materials WHERE id = ?').get(trainingId)) {
    const originalName = 'safety-essentials-training-th.pdf'
    const storedName = 'safety-essentials-training-th.pdf'
    const sourcePath = path.join(root, 'seed', originalName)
    await writeFile(path.join(trainingUploadDir, storedName), await readFile(sourcePath))
    db.prepare(`INSERT INTO training_materials
      (id, public_token, title, description, original_name, stored_name, mime_type, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', 1, ?, ?, ?)`)
      .run(trainingId, newPublicToken(), 'คู่มืออบรมความปลอดภัยพื้นฐานในสถานที่ทำงาน', 'สื่ออบรม 3 หน้า: PPE เครื่องจักร สารเคมี งานเสี่ยง และการตอบสนองเหตุฉุกเฉิน', originalName, storedName, adminId, timestamp, timestamp)
  }
  db.prepare("UPDATE app_settings SET setting_value = '1' WHERE setting_key = 'sample_safety_content_seeded'").run()
}

const fireTrainingId = 'sample-fire-evacuation-training-v1'
if (!db.prepare('SELECT id FROM training_materials WHERE id = ?').get(fireTrainingId)) {
  const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at LIMIT 1").get()?.id
  if (!adminId) throw new Error('Cannot add sample fire-safety training without an active administrator account.')
  const originalName = 'fire-prevention-emergency-evacuation-th.pdf'
  const storedName = originalName
  const companionOriginalName = 'fire-prevention-emergency-evacuation-th.pptx'
  const companionStoredName = companionOriginalName
  await writeFile(path.join(trainingUploadDir, storedName), await readFile(path.join(root, 'seed', originalName)))
  await writeFile(path.join(trainingUploadDir, companionStoredName), await readFile(path.join(root, 'seed', companionOriginalName)))
  const timestamp = nowIso()
  db.prepare(`INSERT INTO training_materials
    (id, public_token, title, description, original_name, stored_name, mime_type,
      companion_original_name, companion_stored_name, is_active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, 1, ?, ?, ?)`)
  .run(fireTrainingId, newPublicToken(), 'การป้องกันอัคคีภัยและการอพยพฉุกเฉิน',
      'สื่ออบรม 8 สไลด์ พร้อมไฟล์ PowerPoint สำหรับนำไปใช้ประกอบการอบรม',
      originalName, storedName, companionOriginalName, companionStoredName, adminId, timestamp, timestamp)
}

if (!db.prepare('SELECT id FROM hiyari_forms WHERE id = ?').get('hiyari-fm-sft-42')) {
  const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at LIMIT 1").get()?.id
  if (!adminId) throw new Error('Cannot create the Hiyari Hat form without an active administrator account.')
  const timestamp = nowIso()
  db.prepare(`INSERT INTO hiyari_forms
    (id, public_token, title, description, is_active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
    .run('hiyari-fm-sft-42', newPublicToken(), 'Hiyari Hat Report · FM-SFT-42 Rev.01',
      'รายงานสภาพหรือเหตุการณ์ที่อาจก่อให้เกิดอุบัติเหตุ เพื่อปรับปรุงและป้องกันการเกิดซ้ำ', adminId, timestamp, timestamp)
}

db.exec(`
  UPDATE responses
  SET responsible_user_id = (
    SELECT id FROM users
    WHERE employee_code != '' AND LOWER(TRIM(employee_code)) = LOWER(TRIM(responses.responsible))
    ORDER BY is_active DESC LIMIT 1
  )
  WHERE result = 'NG' AND responsible_user_id = '' AND EXISTS (
    SELECT 1 FROM users WHERE employee_code != '' AND LOWER(TRIM(employee_code)) = LOWER(TRIM(responses.responsible))
  );
  UPDATE responses
  SET responsible_user_id = (
    SELECT id FROM users
    WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(responses.responsible))
    LIMIT 1
  )
  WHERE result = 'NG' AND responsible_user_id = '' AND (
    SELECT COUNT(*) FROM users WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(responses.responsible))
  ) = 1;
`)

const app = express()
app.disable('x-powered-by')
if (isProduction) app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))
app.use(session({
  name: 'daily-safety.sid',
  secret: process.env.SESSION_SECRET || 'change-this-demo-session-secret-before-deployment',
  store: new SQLiteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 10,
  },
}))

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('รองรับไฟล์ JPG, PNG, WebP หรือ HEIC เท่านั้น')
      error.status = 400
      return callback(error)
    }
    callback(null, true)
  },
})
const trainingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
})
const hiyariUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const error = new Error('รองรับรูปภาพ JPG, PNG หรือ WebP เท่านั้น')
      error.status = 400
      return callback(error)
    }
    callback(null, true)
  },
})

function safeUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    name: row.display_name || row.name,
    employeeCode: row.employee_code || row.employeeCode || '',
    role: row.role,
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
  }
}

function employeeDto(row) {
  return {
    employeeCode: row.employee_code,
    nameTh: row.name_th,
    nameEn: row.name_en,
    positionTh: row.position_th,
    positionEn: row.position_en,
    departmentTh: row.department_th,
    departmentEn: row.department_en,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function employeeInput(body, existing) {
  const value = (key, oldValue = '') => String(body?.[key] ?? oldValue).trim()
  return {
    employeeCode: value('employeeCode', existing?.employee_code).toUpperCase(),
    nameTh: value('nameTh', existing?.name_th),
    nameEn: value('nameEn', existing?.name_en),
    positionTh: value('positionTh', existing?.position_th),
    positionEn: value('positionEn', existing?.position_en),
    departmentTh: value('departmentTh', existing?.department_th),
    departmentEn: value('departmentEn', existing?.department_en),
  }
}

function isValidEmployee(employee) {
  return /^[A-Z0-9._-]{1,40}$/.test(employee.employeeCode)
    && Boolean(employee.nameTh || employee.nameEn)
    && employee.nameTh.length <= 160 && employee.nameEn.length <= 160
    && employee.positionTh.length <= 160 && employee.positionEn.length <= 160
    && employee.departmentTh.length <= 160 && employee.departmentEn.length <= 160
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' })
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.session.user.id)
  if (!user) {
    req.session.destroy(() => {})
    return res.status(401).json({ error: 'บัญชีผู้ใช้นี้ถูกปิดใช้งานแล้ว' })
  }
  req.session.user = safeUser(user)
  next()
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้' })
    next()
  })
}

function addAudit(userId, action, targetType, targetId, details = {}) {
  db.prepare(`INSERT INTO audit_log (id, user_id, action, target_type, target_id, details, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, action, targetType, targetId, JSON.stringify(details), nowIso())
}

function checklistDto(row) {
  return { key: row.item_key, title: row.title, description: row.description, choices: normalizeChecklistChoices(parseJson(row.choices_json, RESULTS)) || RESULTS, order: row.order_index, isActive: Boolean(row.is_active) }
}

function normalizeChecklistChoices(value) {
  if (!Array.isArray(value)) return null
  const choices = RESULTS.filter((choice) => value.includes(choice))
  return choices.length ? choices : null
}

function activeChecklist() {
  return db.prepare('SELECT * FROM checklist_items WHERE is_active = 1 ORDER BY order_index, title COLLATE NOCASE').all().map(checklistDto)
}

function parseJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function formatBangkokParts(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { time: `${fields.hour}:${fields.minute}`, date: `${fields.day}-${fields.month}-${fields.year}` }
}

function styleReportSheet(sheet, columnCount, rowCount) {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF11675D' } }
  header.alignment = { vertical: 'middle', wrapText: true }
  header.height = 30
  if (rowCount > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } }
  for (let index = 2; index <= sheet.rowCount; index += 1) sheet.getRow(index).alignment = { vertical: 'top', wrapText: true }
}

function newPublicToken() {
  return randomBytes(24).toString('base64url')
}

function assessmentQuestionDto(row, includeKey = true) {
  const question = {
    prompt: row.prompt,
    type: row.question_type,
    options: parseJson(row.options_json, []),
    required: Boolean(row.is_required),
    order: row.order_index,
  }
  if (includeKey) return { id: row.id, ...question, correctOption: row.correct_option }
  return { id: row.id, ...question }
}

function assessmentDto(row) {
  const questions = db.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY order_index, id').all(row.id)
  return {
    id: row.id,
    token: row.public_token,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    isPublished: Boolean(row.is_published),
    allowMultipleAttempts: Boolean(row.allow_multiple_attempts),
    questionCount: questions.length,
    submissionCount: db.prepare('SELECT COUNT(*) AS count FROM assessment_submissions WHERE assessment_id = ?').get(row.id).count,
    questions: questions.map((question) => assessmentQuestionDto(question)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizedAssessmentQuestions(value) {
  if (!Array.isArray(value) || value.length > 100) return null
  const questions = []
  for (const [index, source] of value.entries()) {
    const prompt = String(source?.prompt || '').trim()
    const type = source?.type === 'text' ? 'text' : source?.type === 'choice' ? 'choice' : ''
    if (!prompt || prompt.length > 1000 || !type) return null
    let options = []
    let correctOption = null
    if (type === 'choice') {
      options = Array.isArray(source.options) ? [...new Set(source.options.map((option) => String(option).trim()).filter(Boolean))] : []
      if (options.length < 2 || options.length > 12 || options.some((option) => option.length > 300)) return null
      if (source.correctOption !== null && source.correctOption !== undefined && source.correctOption !== '') {
        correctOption = Number(source.correctOption)
        if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length) return null
      }
    }
    questions.push({ id: String(source.id || ''), prompt, type, options, correctOption, required: source.required !== false, order: index + 1 })
  }
  return questions
}

function saveAssessmentQuestions(assessmentId, questions) {
  const existing = new Set(db.prepare('SELECT id FROM assessment_questions WHERE assessment_id = ?').all(assessmentId).map((row) => row.id))
  const retained = []
  const insert = db.prepare(`INSERT INTO assessment_questions
    (id, assessment_id, prompt, question_type, options_json, correct_option, is_required, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const update = db.prepare(`UPDATE assessment_questions SET prompt = ?, question_type = ?, options_json = ?,
    correct_option = ?, is_required = ?, order_index = ? WHERE id = ? AND assessment_id = ?`)
  for (const question of questions) {
    const id = existing.has(question.id) ? question.id : randomUUID()
    retained.push(id)
    if (existing.has(id)) update.run(question.prompt, question.type, JSON.stringify(question.options), question.correctOption, question.required ? 1 : 0, question.order, id, assessmentId)
    else insert.run(id, assessmentId, question.prompt, question.type, JSON.stringify(question.options), question.correctOption, question.required ? 1 : 0, question.order)
  }
  if (!retained.length) db.prepare('DELETE FROM assessment_questions WHERE assessment_id = ?').run(assessmentId)
  else db.prepare(`DELETE FROM assessment_questions WHERE assessment_id = ? AND id NOT IN (${retained.map(() => '?').join(',')})`).run(assessmentId, ...retained)
}

function trainingMaterialDto(row) {
  return {
    id: row.id,
    token: row.public_token,
    title: row.title,
    description: row.description,
    originalName: row.original_name,
    mimeType: row.mime_type,
    companionOriginalName: row.companion_original_name || '',
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function hiyariFormDto(row) {
  return {
    id: row.id,
    token: row.public_token,
    title: row.title,
    description: row.description,
    isActive: Boolean(row.is_active),
    submissionCount: row.submission_count ?? db.prepare('SELECT COUNT(*) AS count FROM hiyari_submissions WHERE form_id = ?').get(row.id).count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function hiyariSubmissionDto(row) {
  const photos = parseJson(row.photos_json, []).map((photo) => ({
    id: photo.id,
    originalName: photo.originalName,
    url: `/api/admin/hiyari-submissions/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photo.id)}`,
  }))
  return {
    id: row.id,
    formId: row.form_id,
    formTitle: row.form_title || '',
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
    department: row.department,
    language: row.language,
    reportDate: row.report_date,
    whenText: row.when_text,
    whereText: row.where_text,
    whatHappened: row.what_happened,
    suggestions: row.suggestions,
    note: row.note,
    submittedAt: row.submitted_at,
    photos,
  }
}

async function persistTrainingFile(file) {
  if (!file) return null
  const originalName = path.basename(String(file.originalname || 'file')).replace(/[\r\n\0]/g, '').slice(0, 180) || 'file'
  let extension
  let mimeType
  if (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-') {
    extension = '.pdf'
    mimeType = 'application/pdf'
  } else if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    const metadata = await sharp(file.buffer, { failOn: 'error' }).metadata()
    const formats = { jpeg: ['.jpg', 'image/jpeg'], png: ['.png', 'image/png'], webp: ['.webp', 'image/webp'] }
    const format = formats[metadata.format]
    if (!format) {
      const error = new Error('รองรับเฉพาะ PDF, JPG, PNG หรือ WebP')
      error.status = 400
      throw error
    }
    extension = format[0]
    mimeType = format[1]
  } else {
    const error = new Error('รองรับเฉพาะ PDF, JPG, PNG หรือ WebP')
    error.status = 400
    throw error
  }
  const storedName = `${randomUUID()}${extension}`
  await writeFile(path.join(trainingUploadDir, storedName), file.buffer, { flag: 'wx' })
  return { originalName, storedName, mimeType }
}

async function persistHiyariPhoto(file) {
  const metadata = await sharp(file.buffer, { failOn: 'error' }).metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
    const error = new Error('ไฟล์รูปภาพไม่ถูกต้อง กรุณาใช้ JPG, PNG หรือ WebP')
    error.status = 400
    throw error
  }
  const id = randomUUID()
  const storedName = `${id}.jpg`
  const originalName = path.basename(String(file.originalname || 'photo')).replace(/[\r\n\0]/g, '').slice(0, 180) || 'photo'
  const buffer = await sharp(file.buffer, { failOn: 'error' }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer()
  await writeFile(path.join(hiyariUploadDir, storedName), buffer, { flag: 'wx' })
  return { id, originalName, storedName, mimeType: 'image/jpeg' }
}

function fileExtension(mimeType) {
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' })[mimeType]
}

async function persistPhoto(file, { inspectionId, responseId, type, userId }) {
  const storedName = `${randomUUID()}${fileExtension(file.mimetype)}`
  await writeFile(path.join(uploadDir, storedName), file.buffer, { flag: 'wx' })
  const photo = {
    id: randomUUID(), inspectionId, responseId, type,
    originalName: path.basename(file.originalname).slice(0, 180), storedName,
    mimeType: file.mimetype, userId, uploadedAt: nowIso(),
  }
  return photo
}

function insertPhoto(photo) {
  db.prepare(`INSERT INTO attachments
    (id, inspection_id, response_id, attachment_type, original_name, stored_name, mime_type, uploaded_by, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(photo.id, photo.inspectionId, photo.responseId, photo.type, photo.originalName, photo.storedName, photo.mimeType, photo.userId, photo.uploadedAt)
}

function photoDto(row) {
  return {
    id: row.id,
    type: row.attachment_type,
    name: row.original_name,
    uploadedAt: row.uploaded_at,
    url: `/api/photos/${row.id}`,
  }
}

function buildInspectionWhere(filters, user) {
  const clauses = []
  const params = []
  if (user.role !== 'admin') {
    clauses.push(`(i.inspector_id = ? OR EXISTS (
      SELECT 1 FROM responses assigned
      WHERE assigned.inspection_id = i.id AND assigned.result = 'NG'
        AND (assigned.responsible_user_id = ? OR LOWER(TRIM(assigned.responsible)) IN (LOWER(?), LOWER(?)))
    ))`)
    params.push(user.id, user.id, user.name, user.employeeCode)
  }
  if (filters.from) { clauses.push('i.inspection_date >= ?'); params.push(filters.from) }
  if (filters.to) { clauses.push('i.inspection_date <= ?'); params.push(filters.to) }
  if (filters.area) { clauses.push('i.department_area LIKE ?'); params.push(`%${filters.area}%`) }
  if (filters.inspector) { clauses.push('i.inspector_name LIKE ?'); params.push(`%${filters.inspector}%`) }
  if (filters.employeeCode) { clauses.push('i.employee_code LIKE ?'); params.push(`%${filters.employeeCode}%`) }
  if (filters.shift) { clauses.push('i.shift LIKE ?'); params.push(`%${filters.shift}%`) }
  if (filters.result) {
    clauses.push('EXISTS (SELECT 1 FROM responses rf WHERE rf.inspection_id = i.id AND rf.result = ?)')
    params.push(filters.result)
  }
  if (filters.status) {
    clauses.push('EXISTS (SELECT 1 FROM responses rf WHERE rf.inspection_id = i.id AND rf.result = \'NG\' AND rf.follow_up_status = ?)')
    params.push(filters.status)
  }
  if (filters.category) {
    clauses.push('EXISTS (SELECT 1 FROM responses rf WHERE rf.inspection_id = i.id AND rf.item_title = ?)')
    params.push(filters.category)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function inspectionRows(filters, user, limit = null) {
  const where = buildInspectionWhere(filters, user)
  const limitSql = Number.isInteger(limit) ? ' LIMIT ?' : ''
  const params = Number.isInteger(limit) ? [...where.params, limit] : where.params
  return db.prepare(`
    SELECT i.id, i.inspection_date, i.inspection_time, i.inspector_name, i.employee_code, i.department_area, i.shift,
      i.created_at,
      (SELECT COUNT(*) FROM responses r WHERE r.inspection_id = i.id AND r.result = 'NG') AS ng_count,
      (SELECT COUNT(*) FROM responses r WHERE r.inspection_id = i.id AND r.result = 'NG' AND r.follow_up_status != 'แก้ไขแล้ว') AS open_count,
      (SELECT COUNT(*) FROM responses r WHERE r.inspection_id = i.id AND r.result = 'NG' AND r.follow_up_status = 'แก้ไขแล้ว') AS resolved_count
    FROM inspections i ${where.sql}
    ORDER BY i.inspection_date DESC, i.created_at DESC${limitSql}
  `).all(...params).map((row) => ({
    id: row.id,
    date: row.inspection_date,
    time: row.inspection_time,
    inspector: row.inspector_name,
    employeeCode: row.employee_code,
    area: row.department_area,
    shift: row.shift,
    createdAt: row.created_at,
    ngCount: row.ng_count,
    openCount: row.open_count,
    resolvedCount: row.resolved_count,
  }))
}

function getInspection(id) {
  const head = db.prepare('SELECT * FROM inspections WHERE id = ?').get(id)
  if (!head) return null
  const items = db.prepare(`
    SELECT r.*, c.choices_json, COALESCE((SELECT json_group_array(json_object(
      'id', a.id, 'type', a.attachment_type, 'name', a.original_name, 'uploadedAt', a.uploaded_at
    )) FROM attachments a WHERE a.response_id = r.id), '[]') AS photos
    FROM responses r LEFT JOIN checklist_items c ON c.item_key = r.item_key WHERE r.inspection_id = ? ORDER BY r.order_index
  `).all(id).map((row) => ({
    id: row.id,
    key: row.item_key,
    title: row.item_title,
    description: row.item_description,
    choices: normalizeChecklistChoices(parseJson(row.choices_json, RESULTS)) || RESULTS,
    order: row.order_index,
    result: row.result,
    issueDetails: row.issue_details,
    responsible: row.responsible,
    responsibleUserId: row.responsible_user_id || '',
    followUpStatus: row.follow_up_status,
    dueDate: row.due_date,
    resolutionNote: row.resolution_note,
    photos: parseJson(row.photos, []).map((photo) => ({ ...photo, url: `/api/photos/${photo.id}` })),
  }))
  return {
    id: head.id,
    date: head.inspection_date,
    time: head.inspection_time,
    inspector: head.inspector_name,
    employeeCode: head.employee_code,
    area: head.department_area,
    shift: head.shift,
    createdAt: head.created_at,
    items,
  }
}

function canReadInspection(user, inspectionId) {
  if (user.role === 'admin') return true
  return Boolean(db.prepare(`SELECT i.id FROM inspections i
    WHERE i.id = ? AND (i.inspector_id = ? OR EXISTS (
      SELECT 1 FROM responses assigned WHERE assigned.inspection_id = i.id AND assigned.result = 'NG'
        AND (assigned.responsible_user_id = ? OR LOWER(TRIM(assigned.responsible)) IN (LOWER(?), LOWER(?)))
    ))`).get(inspectionId, user.id, user.id, user.name, user.employeeCode))
}

function canReadResponse(user, responseId) {
  if (user.role === 'admin') return true
  return Boolean(db.prepare(`SELECT r.id FROM responses r JOIN inspections i ON i.id = r.inspection_id
    WHERE r.id = ? AND (i.inspector_id = ? OR (r.result = 'NG'
      AND (r.responsible_user_id = ? OR LOWER(TRIM(r.responsible)) IN (LOWER(?), LOWER(?)))))`)
    .get(responseId, user.id, user.id, user.name, user.employeeCode))
}

function inspectionForUser(user, inspection) {
  if (!inspection || user.role === 'admin') return inspection
  const isInspector = Boolean(db.prepare('SELECT id FROM inspections WHERE id = ? AND inspector_id = ?').get(inspection.id, user.id))
  return isInspector ? inspection : { ...inspection, items: inspection.items.filter((item) => item.result === 'NG' && (item.responsibleUserId === user.id || [user.name, user.employeeCode].some((value) => value && value.trim().toLocaleLowerCase() === item.responsible.trim().toLocaleLowerCase()))) }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null })
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.session.user.id)
  if (!user) {
    req.session.destroy(() => {})
    return res.json({ user: null })
  }
  req.session.user = safeUser(user)
  res.json({ user: req.session.user })
})
const loginAttempts = new Map()
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  let attempt = loginAttempts.get(ip)
  if (attempt && Date.now() - attempt.firstAttemptAt > 15 * 60_000) {
    loginAttempts.delete(ip)
    attempt = undefined
  }
  if (attempt?.blockedUntil > Date.now()) return res.status(429).json({ error: 'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอสักครู่แล้วลองใหม่' })
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const row = db.prepare('SELECT * FROM users WHERE lower(username) = ? AND is_active = 1').get(username)
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    const failures = (attempt?.failures || 0) + 1
    loginAttempts.set(ip, { failures, firstAttemptAt: attempt?.firstAttemptAt || Date.now(), blockedUntil: failures >= 8 ? Date.now() + 10 * 60_000 : 0 })
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
  }
  loginAttempts.delete(ip)
  req.session.user = safeUser(row)
  req.session.save((error) => {
    if (error) return res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง' })
    res.json({ user: req.session.user })
  })
})
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('daily-safety.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction })
    res.json({ ok: true })
  })
})
app.get('/api/checklist', requireAuth, (_req, res) => res.json({ items: activeChecklist() }))

app.get('/api/admin/checklist', requireAdmin, (_req, res) => {
  const items = db.prepare('SELECT * FROM checklist_items ORDER BY order_index, title COLLATE NOCASE').all().map(checklistDto)
  res.json({ items })
})

app.post('/api/admin/checklist', requireAdmin, (req, res) => {
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const choices = req.body?.choices === undefined ? RESULTS : normalizeChecklistChoices(req.body.choices)
  const order = Number(req.body?.order)
  if (!title || title.length > 160 || description.length > 1000) return res.status(400).json({ error: 'กรุณากรอกชื่อหัวข้อ และจำกัดรายละเอียดไม่เกิน 1,000 ตัวอักษร' })
  if (!choices) return res.status(400).json({ error: 'เลือกคำตอบอย่างน้อย 1 รายการจาก OK, NG หรือ N/A' })
  const nextOrder = Number.isInteger(order) && order > 0 ? order : db.prepare('SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM checklist_items').get().n
  const key = `custom-${randomUUID()}`
  const timestamp = nowIso()
  db.prepare(`INSERT INTO checklist_items (item_key, title, description, choices_json, order_index, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).run(key, title, description, JSON.stringify(choices), nextOrder, timestamp, timestamp)
  addAudit(req.session.user.id, 'เพิ่มหัวข้อตรวจ', 'checklist_item', key, { title, order: nextOrder, choices })
  res.status(201).json({ item: checklistDto(db.prepare('SELECT * FROM checklist_items WHERE item_key = ?').get(key)) })
})

app.patch('/api/admin/checklist/:key', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM checklist_items WHERE item_key = ?').get(req.params.key)
  if (!existing) return res.status(404).json({ error: 'ไม่พบหัวข้อตรวจ' })
  const title = String(req.body?.title ?? existing.title).trim()
  const description = String(req.body?.description ?? existing.description).trim()
  const choices = req.body?.choices === undefined ? (normalizeChecklistChoices(parseJson(existing.choices_json, RESULTS)) || RESULTS) : normalizeChecklistChoices(req.body.choices)
  const order = Number(req.body?.order ?? existing.order_index)
  const isActive = req.body?.isActive === undefined ? existing.is_active : (req.body.isActive ? 1 : 0)
  if (!title || title.length > 160 || description.length > 1000 || !Number.isInteger(order) || order < 1 || !choices) return res.status(400).json({ error: 'กรุณาตรวจสอบชื่อ รายละเอียด ลำดับ และตัวเลือกคำตอบของหัวข้อ' })
  if (existing.is_active && !isActive && db.prepare('SELECT COUNT(*) AS count FROM checklist_items WHERE is_active = 1').get().count <= 1) return res.status(409).json({ error: 'ต้องมีหัวข้อตรวจที่เปิดใช้งานอย่างน้อย 1 หัวข้อ' })
  db.prepare(`UPDATE checklist_items SET title = ?, description = ?, choices_json = ?, order_index = ?, is_active = ?, updated_at = ? WHERE item_key = ?`)
    .run(title, description, JSON.stringify(choices), order, isActive, nowIso(), req.params.key)
  addAudit(req.session.user.id, isActive === existing.is_active ? 'แก้ไขหัวข้อตรวจ' : (isActive ? 'เปิดใช้หัวข้อตรวจ' : 'ปิดใช้หัวข้อตรวจ'), 'checklist_item', req.params.key, { title, order, choices, isActive: Boolean(isActive) })
  res.json({ item: checklistDto(db.prepare('SELECT * FROM checklist_items WHERE item_key = ?').get(req.params.key)) })
})

app.delete('/api/admin/checklist/:key', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM checklist_items WHERE item_key = ?').get(req.params.key)
  if (!existing) return res.status(404).json({ error: 'ไม่พบหัวข้อตรวจ' })
  if (existing.is_active && db.prepare('SELECT COUNT(*) AS count FROM checklist_items WHERE is_active = 1').get().count <= 1) return res.status(409).json({ error: 'ต้องมีหัวข้อตรวจที่เปิดใช้งานอย่างน้อย 1 หัวข้อ' })
  db.prepare('UPDATE checklist_items SET is_active = 0, updated_at = ? WHERE item_key = ?').run(nowIso(), req.params.key)
  addAudit(req.session.user.id, 'ปิดใช้หัวข้อตรวจ', 'checklist_item', req.params.key, { title: existing.title })
  res.json({ ok: true })
})

app.get('/api/suggestions', requireAuth, (req, res) => {
  const user = req.session.user
  const scoped = user.role !== 'admin'
  const language = req.query.lang === 'en' ? 'en' : 'th'
  const inspectionWhere = scoped ? 'WHERE inspector_id = ?' : ''
  const inspectionParams = scoped ? [user.id] : []
  const areaRows = db.prepare(`SELECT DISTINCT department_area AS value FROM inspections ${inspectionWhere} ${scoped ? 'AND' : 'WHERE'} department_area != '' ORDER BY value COLLATE NOCASE LIMIT 100`)
    .all(...inspectionParams)
  const shiftRows = db.prepare(`SELECT DISTINCT shift AS value FROM inspections ${inspectionWhere} ${scoped ? 'AND' : 'WHERE'} shift != '' ORDER BY value COLLATE NOCASE LIMIT 50`)
    .all(...inspectionParams)
  const inspectorRows = db.prepare(`SELECT DISTINCT inspector_name AS name, employee_code AS employeeCode FROM inspections ${inspectionWhere} ${scoped ? 'AND' : 'WHERE'} inspector_name != '' ORDER BY name COLLATE NOCASE LIMIT 200`)
    .all(...inspectionParams)
  const responsibleRows = db.prepare(`SELECT DISTINCT r.responsible AS value FROM responses r JOIN inspections i ON i.id = r.inspection_id ${scoped ? 'WHERE i.inspector_id = ? AND' : 'WHERE'} r.responsible != '' ORDER BY value COLLATE NOCASE LIMIT 200`)
    .all(...inspectionParams)
  const users = scoped ? [user] : db.prepare("SELECT display_name AS name, employee_code AS employeeCode FROM users WHERE is_active = 1 AND (display_name != '' OR employee_code != '')").all()
  const directoryWhere = scoped ? 'WHERE employee_code = ?' : ''
  const directoryParams = scoped ? [user.employeeCode] : []
  const directoryRows = db.prepare(`SELECT employee_code AS employeeCode, name_${language} AS name FROM employee_directory ${directoryWhere} ORDER BY name COLLATE NOCASE LIMIT 1000`).all(...directoryParams)
  const inspectors = [...new Set([...inspectorRows.map((row) => row.name), ...users.map((row) => row.name), ...directoryRows.map((row) => row.name)].filter(Boolean))]
  const employeeCodes = [...new Set([...inspectorRows.map((row) => row.employeeCode), ...users.map((row) => row.employeeCode), ...directoryRows.map((row) => row.employeeCode)].filter(Boolean))]
  res.json({
    areas: areaRows.map((row) => row.value),
    shifts: shiftRows.map((row) => row.value),
    inspectors,
    employeeCodes,
    responsibles: responsibleRows.map((row) => row.value),
  })
})

app.get('/api/assignees', requireAuth, (_req, res) => {
  const users = db.prepare("SELECT id, username, display_name, employee_code, role, is_active FROM users WHERE is_active = 1 AND role IN ('leader', 'employee') ORDER BY display_name COLLATE NOCASE").all()
  res.json({ assignees: users.map(safeUser) })
})

app.get('/api/my-tasks', requireAuth, (req, res) => {
  const user = req.session.user
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const tasks = db.prepare(`
    SELECT r.id, i.id AS inspection_id, i.inspection_date AS date, i.inspection_time AS time,
      i.inspector_name AS inspector, i.employee_code AS employee_code,
      i.department_area AS area, i.shift, r.item_title AS title,
      r.item_description AS description, r.issue_details AS issue_details,
      r.responsible, r.follow_up_status AS follow_up_status, r.due_date AS due_date,
      (SELECT COUNT(*) FROM attachments a WHERE a.response_id = r.id AND a.attachment_type = 'before') AS before_photos,
      (SELECT COUNT(*) FROM attachments a WHERE a.response_id = r.id AND a.attachment_type = 'after') AS after_photos
    FROM responses r JOIN inspections i ON i.id = r.inspection_id
    WHERE r.result = 'NG' AND r.follow_up_status != 'แก้ไขแล้ว'
      AND (r.responsible_user_id = ? OR LOWER(TRIM(r.responsible)) IN (LOWER(?), LOWER(?)))
    ORDER BY CASE WHEN r.due_date != '' AND r.due_date < ? THEN 0 ELSE 1 END,
      CASE r.follow_up_status WHEN 'ยังไม่แก้ไข' THEN 0 ELSE 1 END,
      CASE WHEN r.due_date = '' THEN 1 ELSE 0 END, r.due_date, i.inspection_date DESC, i.created_at DESC
    LIMIT 200
  `).all(user.id, user.name, user.employeeCode, today).map((row) => ({
    id: row.id, inspectionId: row.inspection_id, date: row.date, time: row.time,
    inspector: row.inspector, employeeCode: row.employee_code, area: row.area, shift: row.shift,
    title: row.title, description: row.description, issueDetails: row.issue_details,
    responsible: row.responsible, followUpStatus: row.follow_up_status, dueDate: row.due_date,
    beforePhotos: row.before_photos, afterPhotos: row.after_photos,
    overdue: Boolean(row.due_date && row.due_date < today),
  }))
  res.json({ tasks, counts: {
    total: tasks.length,
    notStarted: tasks.filter((task) => task.followUpStatus === 'ยังไม่แก้ไข').length,
    inProgress: tasks.filter((task) => task.followUpStatus === 'กำลังแก้ไข').length,
    overdue: tasks.filter((task) => task.overdue).length,
  } })
})

app.get('/api/dashboard', requireAdmin, (req, res) => {
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const [year, month, day] = todayKey.split('-').map(Number)
  const startKey = new Date(Date.UTC(year, month - 1, day - 6)).toISOString().slice(0, 10)
  const from = String(req.query.from || startKey)
  const to = String(req.query.to || todayKey)
  const filters = { ...req.query, from, to }
  const where = buildInspectionWhere(filters, req.session.user)
  const total = db.prepare(`SELECT COUNT(*) AS n FROM inspections i ${where.sql}`).get(...where.params).n
  const counts = db.prepare(`
    SELECT COUNT(*) AS checked,
      SUM(CASE WHEN r.result = 'NG' THEN 1 ELSE 0 END) AS ng,
      SUM(CASE WHEN r.result = 'NG' AND r.follow_up_status != 'แก้ไขแล้ว' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN r.result = 'NG' AND r.follow_up_status = 'แก้ไขแล้ว' THEN 1 ELSE 0 END) AS resolved
    FROM inspections i LEFT JOIN responses r ON r.inspection_id = i.id ${where.sql}
  `).get(...where.params)
  const overdue = db.prepare(`
    SELECT COUNT(*) AS n FROM responses r JOIN inspections i ON i.id = r.inspection_id
    WHERE i.inspection_date >= ? AND i.inspection_date <= ? AND r.result = 'NG'
      AND r.follow_up_status != 'แก้ไขแล้ว' AND r.due_date != '' AND r.due_date < ?
  `).get(from, to, todayKey).n
  const categoryWhere = buildInspectionWhere({ from, to }, req.session.user)
  const categoryResult = req.query.categoryResult === 'N/A' ? 'N/A' : 'NG'
  const categories = db.prepare(`
    SELECT r.item_title AS title, COUNT(*) AS count
    FROM responses r JOIN inspections i ON i.id = r.inspection_id
    ${categoryWhere.sql ? `${categoryWhere.sql} AND r.result = ?` : 'WHERE r.result = ?'}
    GROUP BY r.item_title ORDER BY count DESC, r.item_title LIMIT 6
  `).all(...categoryWhere.params, categoryResult)
  const trend = db.prepare(`
    SELECT i.inspection_date AS date,
      SUM(CASE WHEN r.result = 'OK' THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN r.result = 'NG' THEN 1 ELSE 0 END) AS ng,
      SUM(CASE WHEN r.result = 'N/A' THEN 1 ELSE 0 END) AS na
    FROM inspections i LEFT JOIN responses r ON r.inspection_id = i.id
    WHERE i.inspection_date >= ? AND i.inspection_date <= ?
    GROUP BY i.inspection_date ORDER BY i.inspection_date
  `).all(from, to)
  const recent = inspectionRows({ from, to }, req.session.user, 10)
  res.json({
    from, to,
    stats: {
      inspections: total,
      checked: counts.checked || 0,
      ng: counts.ng || 0,
      open: counts.open || 0,
      resolved: counts.resolved || 0,
      overdue,
      resolutionRate: counts.ng ? Math.round((counts.resolved / counts.ng) * 100) : 0,
    },
    categories,
    trend,
    recent,
  })
})

app.get('/api/dashboard/category', requireAdmin, (req, res) => {
  const category = String(req.query.category || '').trim()
  const from = String(req.query.from || '')
  const to = String(req.query.to || '')
  const result = String(req.query.result || 'NG')
  if (!category) return res.status(400).json({ error: 'กรุณาระบุหัวข้อตรวจ' })
  if (result !== 'NG' && result !== 'N/A') return res.status(400).json({ error: 'สถานะผลตรวจไม่ถูกต้อง' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return res.status(400).json({ error: 'ช่วงวันที่ไม่ถูกต้อง' })
  }

  const where = buildInspectionWhere({ from, to }, req.session.user)
  const itemWhere = where.sql ? `${where.sql} AND r.item_title = ?` : 'WHERE r.item_title = ?'
  const params = [...where.params, category]
  const counts = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN r.result = 'OK' THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN r.result = 'NG' THEN 1 ELSE 0 END) AS ng,
      SUM(CASE WHEN r.result = 'N/A' THEN 1 ELSE 0 END) AS na
    FROM inspections i JOIN responses r ON r.inspection_id = i.id
    ${itemWhere}
  `).get(...params)
  const recordTotal = db.prepare(`
    SELECT COUNT(*) AS total
    FROM inspections i JOIN responses r ON r.inspection_id = i.id
    ${itemWhere} AND r.result = ?
  `).get(...params, result).total
  const records = db.prepare(`
    SELECT i.id, i.inspection_date AS date, i.inspection_time AS time,
      i.inspector_name AS inspector, i.employee_code AS employeeCode,
      i.department_area AS area, i.shift, r.result,
      r.follow_up_status AS followUpStatus
    FROM inspections i JOIN responses r ON r.inspection_id = i.id
    ${itemWhere} AND r.result = ?
    ORDER BY i.inspection_date DESC, i.created_at DESC LIMIT 100
  `).all(...params, result)
  res.json({
    title: category, from, to,
    total: counts.total || 0,
    recordTotal,
    counts: { ok: counts.ok || 0, ng: counts.ng || 0, na: counts.na || 0 },
    records,
  })
})

app.get('/api/inspections/export.csv', requireAdmin, (req, res) => {
  const filters = req.query
  const where = buildInspectionWhere(filters, req.session.user)
  const rows = db.prepare(`
    SELECT i.inspection_date, i.inspection_time, i.inspector_name, i.employee_code, i.department_area, i.shift,
      r.item_title, r.item_description, r.result, r.issue_details, r.responsible,
      r.follow_up_status, r.due_date, r.resolution_note
    FROM inspections i JOIN responses r ON r.inspection_id = i.id ${where.sql}
    ORDER BY i.inspection_date DESC, i.created_at DESC, r.order_index
  `).all(...where.params)
  const headers = ['วันที่ตรวจ', 'เวลาตรวจ', 'ผู้ตรวจ', 'รหัส', 'แผนก/พื้นที่', 'กะ', 'หัวข้อ', 'รายการตรวจ', 'ผลตรวจ', 'รายละเอียด NG', 'ผู้รับผิดชอบ', 'สถานะ', 'กำหนดเสร็จ', 'สรุปการแก้ไข']
  const cell = (value) => {
    let text = String(value ?? '')
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = `\uFEFF${[headers, ...rows.map((row) => Object.values(row))].map((row) => row.map(cell).join(',')).join('\r\n')}`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="daily-safety-report.csv"')
  res.send(csv)
})

app.get('/api/inspections/export.xlsx', requireAdmin, async (req, res, next) => {
  try {
    const filters = req.query
    const english = req.query.lang === 'en'
    const where = buildInspectionWhere(filters, req.session.user)
    const count = db.prepare(`SELECT COUNT(*) AS count FROM inspections i JOIN responses r ON r.inspection_id = i.id ${where.sql}`).get(...where.params).count
    if (count > 5000) return res.status(413).json({ error: english ? 'This report has more than 5,000 items. Narrow the date range or filters before exporting.' : 'รายงานมีมากกว่า 5,000 รายการ กรุณาระบุช่วงวันที่หรือเงื่อนไขให้แคบลงก่อนส่งออก' })

    const rows = db.prepare(`
      SELECT r.id AS response_id, i.inspection_date, i.inspection_time, i.inspector_name, i.employee_code, i.department_area, i.shift,
        r.item_title, r.item_description, r.result, r.issue_details, r.responsible,
        r.follow_up_status, r.due_date, r.resolution_note
      FROM inspections i JOIN responses r ON r.inspection_id = i.id ${where.sql}
      ORDER BY i.inspection_date DESC, i.created_at DESC, r.order_index
    `).all(...where.params)
    const attachments = db.prepare(`
      SELECT a.response_id, a.attachment_type, a.original_name, a.stored_name, a.mime_type
      FROM attachments a JOIN inspections i ON i.id = a.inspection_id ${where.sql}
      ORDER BY a.uploaded_at
    `).all(...where.params)
    if (attachments.length > 1000) return res.status(413).json({ error: english ? 'This export has more than 1,000 photos. Narrow the date range or filters before exporting.' : 'รายงานมีรูปมากกว่า 1,000 รูป กรุณาระบุช่วงวันที่หรือเงื่อนไขให้แคบลงก่อนส่งออก' })
    const byResponse = new Map()
    for (const attachment of attachments) {
      const photos = byResponse.get(attachment.response_id) || { before: [], after: [] }
      photos[attachment.attachment_type].push(attachment)
      byResponse.set(attachment.response_id, photos)
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Daily Safety | Y.T. Rubber'
    workbook.created = new Date()
    workbook.subject = 'Daily safety inspection report'
    workbook.title = 'Daily Safety Inspection Report'
    const sheet = workbook.addWorksheet(english ? 'Inspection report' : 'รายงานตรวจความปลอดภัย', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    const headers = english
      ? ['Date', 'Time', 'Inspector', 'Employee ID', 'Department / area', 'Shift', 'Checklist item', 'Inspection criteria', 'Result', 'Finding details', 'Owner', 'Action status', 'Due date', 'Resolution notes', 'Before correction', 'After correction']
      : ['วันที่ตรวจ', 'เวลาตรวจ', 'ผู้ตรวจ', 'รหัสพนักงาน', 'แผนก / พื้นที่', 'กะ', 'หัวข้อตรวจ', 'เกณฑ์การตรวจ', 'ผลตรวจ', 'รายละเอียดที่พบ', 'ผู้รับผิดชอบ', 'สถานะการแก้ไข', 'กำหนดเสร็จ', 'บันทึกการแก้ไข', 'รูปก่อนแก้ไข', 'รูปหลังแก้ไข']
    const columns = [13, 10, 22, 16, 22, 12, 24, 44, 12, 38, 22, 19, 14, 38, 21, 21]
    sheet.columns = columns.map((width) => ({ width }))
    sheet.mergeCells('A1:P1')
    sheet.getCell('A1').value = english ? 'DAILY SAFETY INSPECTION REPORT' : 'รายงานแบบตรวจความปลอดภัยประจำวัน'
    sheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14574E' } }
    sheet.getCell('A1').alignment = { vertical: 'middle' }
    sheet.getRow(1).height = 34
    sheet.mergeCells('A2:P2')
    sheet.getCell('A2').value = `${english ? 'Exported' : 'ส่งออกเมื่อ'} ${new Intl.DateTimeFormat(english ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date())} · ${english ? 'Records' : 'รายการ'} ${rows.length}${filters.from ? ` · ${english ? 'From' : 'ตั้งแต่'} ${filters.from}` : ''}${filters.to ? ` · ${english ? 'To' : 'ถึง'} ${filters.to}` : ''}`
    sheet.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: 'FF52645F' } }
    sheet.getCell('A2').alignment = { vertical: 'middle' }
    sheet.getRow(2).height = 22
    sheet.getRow(3).height = 8
    const headerRow = sheet.getRow(4)
    headerRow.values = headers
    headerRow.height = 30
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF276D63' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF14574E' } } }
    })
    sheet.autoFilter = { from: 'A4', to: 'P4' }

    const imageBufferCache = new Map()
    const imageIdCache = new Map()
    async function getImageData(photo) {
      if (!imageBufferCache.has(photo.id)) {
        imageBufferCache.set(photo.id, (async () => {
          const source = await readFile(path.join(uploadDir, photo.stored_name))
          const result = await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 440, height: 280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true })
          return { buffer: result.data, width: result.info.width, height: result.info.height }
        })())
      }
      return imageBufferCache.get(photo.id)
    }
    async function getImageId(photo) {
      if (imageIdCache.has(photo.id)) return imageIdCache.get(photo.id)
      const imageData = await getImageData(photo)
      const imageId = workbook.addImage({ buffer: imageData.buffer, extension: 'jpeg' })
      imageIdCache.set(photo.id, imageId)
      return imageId
    }
    function fitImage(imageData, maxWidth, maxHeight) {
      const scale = Math.min(maxWidth / imageData.width, maxHeight / imageData.height, 1)
      return { width: Math.round(imageData.width * scale), height: Math.round(imageData.height * scale) }
    }

    for (const [index, row] of rows.entries()) {
      const excelRow = index + 5
      const photos = byResponse.get(row.response_id) || { before: [], after: [] }
      const values = [row.inspection_date, row.inspection_time, row.inspector_name, row.employee_code, row.department_area, row.shift,
        row.item_title, row.item_description, row.result, row.issue_details, row.responsible,
        row.follow_up_status, row.due_date, row.resolution_note,
        photos.before.length ? (english ? `${photos.before.length} photo${photos.before.length > 1 ? 's' : ''}` : `${photos.before.length} รูป`) : '',
        photos.after.length ? (english ? `${photos.after.length} photo${photos.after.length > 1 ? 's' : ''}` : `${photos.after.length} รูป`) : '']
      const dataRow = sheet.getRow(excelRow)
      dataRow.values = values
      dataRow.height = 62
      dataRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Aptos', size: 9, color: { argb: 'FF24332F' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE7E4' } } }
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9F8' } }
        if (colNumber === 9) {
          const color = row.result === 'OK' ? 'FF13804C' : row.result === 'NG' ? 'FFB42318' : 'FF64748B'
          cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: color } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        }
        if (colNumber === 15 && photos.before.length) cell.note = english ? `${photos.before.length} before photo(s). All are listed on the Photo evidence sheet.` : `แนบรูปก่อนแก้ไข ${photos.before.length} รูป ดูรูปทั้งหมดได้ที่ชีตหลักฐานรูปภาพ`
        if (colNumber === 16 && photos.after.length) cell.note = english ? `${photos.after.length} after photo(s). All are listed on the Photo evidence sheet.` : `แนบรูปหลังแก้ไข ${photos.after.length} รูป ดูรูปทั้งหมดได้ที่ชีตหลักฐานรูปภาพ`
      })

      for (const [type, col] of [['before', 14], ['after', 15]]) {
        const photo = photos[type][0]
        if (!photo) continue
        try {
          const imageData = await getImageData(photo)
          const imageId = await getImageId(photo)
          sheet.addImage(imageId, { tl: { col, row: excelRow - 1 }, ext: fitImage(imageData, 128, 58) })
          dataRow.getCell(col + 1).value = ''
        } catch {
          dataRow.getCell(col + 1).value = english ? 'Preview unavailable' : 'เปิดรูปตัวอย่างไม่ได้'
        }
      }
    }

    const photoSheet = workbook.addWorksheet(english ? 'Photo evidence' : 'หลักฐานรูปภาพ', { views: [{ state: 'frozen', ySplit: 2, showGridLines: false }] })
    photoSheet.columns = [8, 14, 24, 28, 20, 32, 30].map((width) => ({ width }))
    photoSheet.mergeCells('A1:G1')
    photoSheet.getCell('A1').value = english ? 'PHOTO EVIDENCE GALLERY' : 'แกลเลอรีหลักฐานรูปภาพ'
    photoSheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
    photoSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14574E' } }
    photoSheet.getRow(1).height = 32
    const photoHeaders = english ? ['No.', 'Date', 'Area', 'Checklist item', 'Photo type', 'File name', 'Preview'] : ['ลำดับ', 'วันที่ตรวจ', 'พื้นที่', 'หัวข้อตรวจ', 'ประเภทภาพ', 'ชื่อไฟล์', 'รูปภาพ']
    const photoHeader = photoSheet.getRow(2)
    photoHeader.values = photoHeaders
    photoHeader.height = 28
    photoHeader.eachCell((cell) => {
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF276D63' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })
    photoSheet.autoFilter = { from: 'A2', to: 'G2' }
    const rowByResponse = new Map(rows.map((row) => [row.response_id, row]))
    if (!attachments.length) {
      photoSheet.mergeCells('A3:G3')
      photoSheet.getCell('A3').value = english ? 'No photos were attached to this report.' : 'ไม่มีรูปภาพแนบในรายงานนี้'
      photoSheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' }
      photoSheet.getRow(3).height = 32
    }
    for (const [index, photo] of attachments.entries()) {
      const row = rowByResponse.get(photo.response_id)
      const photoRowNumber = index + 3
      const photoRow = photoSheet.getRow(photoRowNumber)
      photoRow.values = [index + 1, row?.inspection_date || '', row?.department_area || '', row?.item_title || '',
        photo.attachment_type === 'before' ? (english ? 'Before correction' : 'ก่อนแก้ไข') : (english ? 'After correction' : 'หลังแก้ไข'), photo.original_name, '']
      photoRow.height = 94
      photoRow.eachCell((cell) => {
        cell.font = { name: 'Aptos', size: 9, color: { argb: 'FF24332F' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE7E4' } } }
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9F8' } }
      })
      try {
        const imageData = await getImageData(photo)
        const imageId = await getImageId(photo)
        photoSheet.addImage(imageId, { tl: { col: 6, row: photoRowNumber - 1 }, ext: fitImage(imageData, 176, 86) })
      } catch {
        photoRow.getCell(7).value = english ? 'Preview unavailable' : 'เปิดรูปตัวอย่างไม่ได้'
      }
    }

    const output = await workbook.xlsx.writeBuffer()
    const fileName = `daily-safety-report-${filters.from || 'all'}-${filters.to || 'all'}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(Buffer.from(output))
  } catch (error) { next(error) }
})

app.get('/api/inspections', requireAuth, (req, res) => {
  const filters = Object.fromEntries(['from', 'to', 'area', 'shift', 'result', 'status', 'category'].map((key) => [key, String(req.query[key] || '')]).filter(([, value]) => value))
  res.json({ inspections: inspectionRows(filters, req.session.user) })
})

app.post('/api/inspections', requireAuth, upload.array('photos', 50), async (req, res) => {
  const checklist = activeChecklist()
  const payload = parseJson(req.body.payload, null)
  if (!payload || !Array.isArray(payload.responses)) return res.status(400).json({ error: 'ข้อมูลแบบตรวจไม่ครบถ้วน' })
  const inspectionDate = String(payload.date || '')
  const inspectionTime = String(payload.time || '')
  const area = String(payload.area || '').trim()
  const shift = String(payload.shift || '').trim()
  let inspectorName = String(payload.inspectorName || req.session.user.name).trim()
  const inputEmployeeCode = String(payload.employeeCode || req.session.user.employeeCode).trim().toUpperCase()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(inspectionTime) || !area || !shift || !inspectorName) return res.status(400).json({ error: 'กรุณากรอกวันที่ เวลา พื้นที่/แผนก กะ และชื่อผู้ตรวจให้ถูกต้อง' })
  if ([area, shift, inspectorName, inputEmployeeCode].some((value) => value.length > 120)) return res.status(400).json({ error: 'ข้อมูลผู้ตรวจ พื้นที่ หรือกะยาวเกินไป' })
  const directoryEmployee = db.prepare('SELECT * FROM employee_directory WHERE UPPER(TRIM(employee_code)) = ?').get(inputEmployeeCode)
  const foldEmployeeName = (name) => String(name || '').normalize('NFC').trim().toLocaleLowerCase()
  if (!directoryEmployee || ![directoryEmployee.name_th, directoryEmployee.name_en].some((name) => name && foldEmployeeName(name) === foldEmployeeName(inspectorName))) {
    return res.status(400).json({ error: 'ผู้ตรวจและรหัสพนักงานไม่ตรงกับรายชื่อพนักงาน' })
  }
  const employeeCode = directoryEmployee.employee_code
  const submitted = new Map(payload.responses.map((item) => [item.key, item]))
  if (!checklist.length || submitted.size !== checklist.length || checklist.some((item) => !submitted.has(item.key))) return res.status(400).json({ error: `กรุณาตรวจให้ครบทั้ง ${checklist.length} หัวข้อ` })
  for (const item of checklist) {
    const response = submitted.get(item.key)
    if (!item.choices.includes(response.result)) return res.status(400).json({ error: `หัวข้อ ${item.title} ไม่รองรับคำตอบนี้` })
    if (response.result === 'NG' && (!String(response.issueDetails || '').trim() || !String(response.responsibleUserId || '').trim())) {
      return res.status(400).json({ error: `หัวข้อ ${item.title} ที่พบ NG ต้องกรอกรายละเอียดและผู้รับผิดชอบ` })
    }
    if (response.result === 'NG') {
      const assignee = db.prepare("SELECT id, display_name FROM users WHERE id = ? AND is_active = 1 AND role IN ('leader', 'employee')").get(String(response.responsibleUserId))
      if (!assignee) return res.status(400).json({ error: 'เลือกบัญชีผู้รับผิดชอบที่เปิดใช้งานจากรายชื่อ' })
      response.responsibleUserId = assignee.id
      response.responsible = assignee.display_name
    }
    if (response.result === 'NG' && response.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(response.dueDate))) return res.status(400).json({ error: `กำหนดเสร็จของหัวข้อ ${item.title} ไม่ถูกต้อง` })
    if (String(response.issueDetails || '').length > 4000 || String(response.responsible || '').length > 120) return res.status(400).json({ error: `รายละเอียดของหัวข้อ ${item.title} ยาวเกินไป` })
  }
  const files = req.files || []
  const metadata = parseJson(req.body.photoMetadata, [])
  if (!Array.isArray(metadata) || metadata.length !== files.length) return res.status(400).json({ error: 'ข้อมูลรูปภาพไม่ครบถ้วน กรุณาลองแนบรูปอีกครั้ง' })
  if (files.reduce((sum, file) => sum + file.size, 0) > 60 * 1024 * 1024) return res.status(413).json({ error: 'ขนาดรูปภาพรวมเกิน 60 MB' })
  const photoCounts = new Map()
  for (let index = 0; index < metadata.length; index += 1) {
    const meta = metadata[index]
    if (!checklist.some((item) => item.key === meta.key) || !['before', 'after'].includes(meta.type)) return res.status(400).json({ error: 'ข้อมูลรูปภาพไม่ถูกต้อง' })
    const key = `${meta.key}:${meta.type}`
    photoCounts.set(key, (photoCounts.get(key) || 0) + 1)
  }
  for (const item of checklist) {
    const response = submitted.get(item.key)
    if (response.result === 'NG' && !photoCounts.get(`${item.key}:before`)) return res.status(400).json({ error: `กรุณาแนบรูปก่อนแก้ไขในหัวข้อ ${item.title}` })
    if (response.result === 'NG' && photoCounts.get(`${item.key}:after`)) return res.status(400).json({ error: `รูปหลังแก้ไขให้แนบเมื่อติดตามปิดงาน: ${item.title}` })
    if (response.result !== 'NG' && (photoCounts.get(`${item.key}:before`) || photoCounts.get(`${item.key}:after`))) return res.status(400).json({ error: `แนบรูปได้เฉพาะหัวข้อ NG (${item.title})` })
  }

  const inspectionId = randomUUID()
  const createdAt = nowIso()
  const responseIds = new Map(checklist.map((item) => [item.key, randomUUID()]))
  const photos = []
  try {
    for (let index = 0; index < files.length; index += 1) {
      const meta = metadata[index]
      photos.push(await persistPhoto(files[index], {
        inspectionId,
        responseId: responseIds.get(meta.key),
        type: meta.type,
        userId: req.session.user.id,
      }))
    }
    db.exec('BEGIN')
    db.prepare(`INSERT INTO inspections (id, inspection_date, inspection_time, inspector_id, inspector_name, employee_code, department_area, shift, created_at, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(inspectionId, inspectionDate, inspectionTime, req.session.user.id, inspectorName, employeeCode, area, shift, createdAt, createdAt)
    const insertResponse = db.prepare(`INSERT INTO responses
      (id, inspection_id, item_key, item_title, item_description, order_index, result, issue_details, responsible, responsible_user_id, follow_up_status, due_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const item of checklist) {
      const response = submitted.get(item.key)
      insertResponse.run(
        responseIds.get(item.key), inspectionId, item.key, item.title, item.description, item.order,
        response.result,
        response.result === 'NG' ? String(response.issueDetails || '').trim() : '',
        response.result === 'NG' ? String(response.responsible || '').trim() : '',
        response.result === 'NG' ? String(response.responsibleUserId || '') : '',
        response.result === 'NG' ? 'ยังไม่แก้ไข' : 'ไม่เกี่ยวข้อง',
        response.result === 'NG' ? String(response.dueDate || '') : '',
        createdAt,
      )
    }
    photos.forEach(insertPhoto)
    addAudit(req.session.user.id, 'สร้างรายการตรวจ', 'inspection', inspectionId, { area, shift })
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transaction may not have started */ }
    await Promise.allSettled(photos.map((photo) => unlink(path.join(uploadDir, photo.storedName))))
    throw error
  }
  res.status(201).json({ inspection: getInspection(inspectionId) })
})

app.get('/api/inspections/:id', requireAuth, (req, res) => {
  const inspection = getInspection(req.params.id)
  if (!inspection) return res.status(404).json({ error: 'ไม่พบรายการตรวจ' })
  if (!canReadInspection(req.session.user, inspection.id)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูรายการนี้' })
  res.json({ inspection: inspectionForUser(req.session.user, inspection) })
})

app.patch('/api/responses/:id', requireAuth, upload.array('photos', 10), async (req, res) => {
  const response = db.prepare(`SELECT r.*, i.id AS parent_id FROM responses r
    JOIN inspections i ON i.id = r.inspection_id WHERE r.id = ?`).get(req.params.id)
  if (!response) return res.status(404).json({ error: 'ไม่พบรายการแก้ไข' })
  if (response.result !== 'NG') return res.status(400).json({ error: 'ติดตามสถานะได้เฉพาะรายการ NG' })
  const user = req.session.user
  const isAdmin = user.role === 'admin'
  const assignedToUser = response.responsible_user_id === user.id || [user.name, user.employeeCode].some((value) => value && value.trim().toLocaleLowerCase() === String(response.responsible || '').trim().toLocaleLowerCase())
  if (!isAdmin && !assignedToUser) return res.status(403).json({ error: 'เฉพาะผู้รับผิดชอบงานนี้เท่านั้นที่อัปเดตได้' })
  if (!isAdmin && response.follow_up_status === 'แก้ไขแล้ว') return res.status(403).json({ error: 'รายการนี้ปิดงานแล้ว' })
  const followUpStatus = String(req.body.followUpStatus || response.follow_up_status)
  const dueDate = isAdmin ? String(req.body.dueDate || '') : response.due_date
  const requestedAssigneeId = String(req.body.responsibleUserId || response.responsible_user_id || '')
  if (!isAdmin && requestedAssigneeId && requestedAssigneeId !== (response.responsible_user_id || '') && requestedAssigneeId !== user.id) {
    return res.status(403).json({ error: 'ไม่สามารถเปลี่ยนผู้รับผิดชอบของงานนี้ได้' })
  }
  if (!isAdmin && req.body.responsible && String(req.body.responsible).trim().toLocaleLowerCase() !== String(response.responsible || '').trim().toLocaleLowerCase()) {
    return res.status(403).json({ error: 'ไม่สามารถเปลี่ยนผู้รับผิดชอบของงานนี้ได้' })
  }
  const selectedAssignee = isAdmin && requestedAssigneeId
    ? db.prepare("SELECT id, display_name FROM users WHERE id = ? AND is_active = 1 AND role IN ('leader', 'employee')").get(requestedAssigneeId)
    : null
  if (isAdmin && requestedAssigneeId && !selectedAssignee) return res.status(400).json({ error: 'เลือกบัญชีผู้รับผิดชอบที่เปิดใช้งานจากรายชื่อ' })
  const responsibleUserId = isAdmin ? (selectedAssignee?.id || response.responsible_user_id || '') : (response.responsible_user_id || (requestedAssigneeId === user.id ? user.id : ''))
  const responsible = isAdmin ? String(selectedAssignee?.display_name || response.responsible).trim() : response.responsible
  const resolutionNote = String(req.body.resolutionNote || '').trim()
  const files = req.files || []
  if (!FOLLOW_UP_STATUSES.includes(followUpStatus)) return res.status(400).json({ error: 'สถานะการแก้ไขไม่ถูกต้อง' })
  if (!responsible) return res.status(400).json({ error: 'กรุณาระบุผู้รับผิดชอบ' })
  if (followUpStatus === 'แก้ไขแล้ว') {
    const existingAfter = db.prepare("SELECT COUNT(*) AS n FROM attachments WHERE response_id = ? AND attachment_type = 'after'").get(response.id).n
    if (!existingAfter && !files.length) return res.status(400).json({ error: 'กรุณาแนบรูปหลังแก้ไขก่อนปิดงาน' })
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > 60 * 1024 * 1024) return res.status(413).json({ error: 'ขนาดรูปภาพรวมเกิน 60 MB' })
  const stored = []
  try {
    for (const file of files) {
      stored.push(await persistPhoto(file, {
        inspectionId: response.parent_id,
        responseId: response.id,
        type: 'after',
        userId: req.session.user.id,
      }))
    }
    db.exec('BEGIN')
    db.prepare(`UPDATE responses SET follow_up_status = ?, due_date = ?, responsible = ?, responsible_user_id = ?, resolution_note = ?, updated_at = ? WHERE id = ?`)
      .run(followUpStatus, dueDate, responsible, responsibleUserId, resolutionNote, nowIso(), response.id)
    stored.forEach(insertPhoto)
    addAudit(req.session.user.id, 'อัปเดตสถานะ NG', 'response', response.id, { status: followUpStatus })
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transaction may not have started */ }
    await Promise.allSettled(stored.map((photo) => unlink(path.join(uploadDir, photo.storedName))))
    throw error
  }
  res.json({ inspection: inspectionForUser(user, getInspection(response.parent_id)) })
})

app.get('/api/photos/:id', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id)
  if (!photo) return res.status(404).json({ error: 'ไม่พบรูปภาพ' })
  if (req.session.user.role !== 'admin' && !canReadResponse(req.session.user, photo.response_id)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูรูปภาพนี้' })
  res.type(photo.mime_type).set('X-Content-Type-Options', 'nosniff').sendFile(path.join(uploadDir, photo.stored_name))
})

app.get('/api/public/employees', (req, res) => {
  const query = String(req.query.q || '').trim()
  if (query.length < 2 || query.length > 80) return res.json({ employees: [] })
  const pattern = `%${query}%`
  const rows = db.prepare(`SELECT employee_code, name_th, name_en, department_th, department_en FROM employee_directory
    WHERE employee_code LIKE ? OR name_th LIKE ? COLLATE NOCASE OR name_en LIKE ? COLLATE NOCASE
    ORDER BY name_th COLLATE NOCASE LIMIT 20`).all(pattern, pattern, pattern)
  res.set('Cache-Control', 'no-store').json({ employees: rows.map((row) => ({
    employeeCode: row.employee_code,
    nameTh: row.name_th,
    nameEn: row.name_en,
    name: (req.query.lang === 'en' ? row.name_en || row.name_th : row.name_th || row.name_en),
    departmentTh: row.department_th || '',
    departmentEn: row.department_en || '',
  })) })
})

app.get('/api/public/hiyari/:token', (req, res) => {
  const form = db.prepare('SELECT * FROM hiyari_forms WHERE public_token = ? AND is_active = 1').get(req.params.token)
  if (!form) return res.status(404).json({ error: 'ไม่พบแบบฟอร์มหรือปิดรับรายงานแล้ว' })
  res.set('Cache-Control', 'no-store').json({ form: { title: form.title, description: form.description } })
})

app.post('/api/public/hiyari/:token/submissions', hiyariUpload.array('photos', 5), async (req, res, next) => {
  const form = db.prepare('SELECT id FROM hiyari_forms WHERE public_token = ? AND is_active = 1').get(req.params.token)
  if (!form) return res.status(404).json({ error: 'ไม่พบแบบฟอร์มหรือปิดรับรายงานแล้ว' })
  const employeeCode = String(req.body?.employeeCode || '').trim().toUpperCase()
  const employeeName = String(req.body?.employeeName || '').trim()
  const language = String(req.body?.language || '')
  const reportDate = String(req.body?.reportDate || '')
  const whenText = String(req.body?.whenText || '').trim()
  const whereText = String(req.body?.whereText || '').trim()
  const whatHappened = String(req.body?.whatHappened || '').trim()
  const suggestions = String(req.body?.suggestions || '').trim()
  const note = String(req.body?.note || '').trim()
  if (!employeeCode || employeeCode.length > 80 || !employeeName || employeeName.length > 160) return res.status(400).json({ error: 'กรุณาเลือกชื่อและรหัสพนักงานจากทะเบียน' })
  if (!['th', 'en', 'my'].includes(language)) return res.status(400).json({ error: 'กรุณาเลือกภาษาของแบบฟอร์ม' })
  const parsedReportDate = new Date(`${reportDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || Number.isNaN(parsedReportDate.getTime()) || parsedReportDate.toISOString().slice(0, 10) !== reportDate) {
    return res.status(400).json({ error: 'กรุณาระบุวันที่รายงาน' })
  }
  if (!whenText || whenText.length > 2000 || !whereText || whereText.length > 2000 || !whatHappened || whatHappened.length > 5000 || suggestions.length > 5000 || note.length > 3000) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ และตรวจสอบความยาวข้อความ' })
  }
  const employee = db.prepare('SELECT * FROM employee_directory WHERE UPPER(TRIM(employee_code)) = ?').get(employeeCode)
  const foldName = (name) => String(name || '').normalize('NFC').trim().toLocaleLowerCase()
  if (!employee || ![employee.name_th, employee.name_en].some((name) => name && foldName(name) === foldName(employeeName))) {
    return res.status(400).json({ error: 'ชื่อและรหัสพนักงานไม่ตรงกับฐานข้อมูล' })
  }
  const department = language === 'en' || language === 'my'
    ? employee.department_en || employee.department_th || ''
    : employee.department_th || employee.department_en || ''
  const id = randomUUID()
  const submittedAt = nowIso()
  const storedPhotos = []
  try {
    for (const file of req.files || []) storedPhotos.push(await persistHiyariPhoto(file))
    db.prepare(`INSERT INTO hiyari_submissions
      (id, form_id, employee_code, employee_name, department, language, report_date,
        when_text, where_text, what_happened, suggestions, note, submitted_at, photos_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, form.id, employee.employee_code, employeeName, department, language, reportDate,
        whenText, whereText, whatHappened, suggestions, note, submittedAt, JSON.stringify(storedPhotos))
    res.status(201).json({ ok: true, submittedAt })
  } catch (error) {
    await Promise.allSettled(storedPhotos.map((photo) => unlink(path.join(hiyariUploadDir, photo.storedName))))
    next(error)
  }
})

app.get('/api/public/assessments/:token', (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE public_token = ? AND is_published = 1').get(req.params.token)
  if (!assessment) return res.status(404).json({ error: 'ไม่พบแบบประเมินหรือปิดรับคำตอบแล้ว' })
  const questions = db.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY order_index, id').all(assessment.id)
  res.set('Cache-Control', 'no-store').json({ assessment: {
    title: assessment.title,
    description: assessment.description,
    instructions: assessment.instructions,
    allowMultipleAttempts: Boolean(assessment.allow_multiple_attempts),
    questions: questions.map((question) => assessmentQuestionDto(question, false)),
  } })
})

app.post('/api/public/assessments/:token/submissions', (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE public_token = ? AND is_published = 1').get(req.params.token)
  if (!assessment) return res.status(404).json({ error: 'ไม่พบแบบประเมินหรือปิดรับคำตอบแล้ว' })
  const employeeCode = String(req.body?.employeeCode || '').trim().toUpperCase()
  const employeeName = String(req.body?.employeeName || '').trim()
  if (!employeeCode || !employeeName || employeeName.length > 160) return res.status(400).json({ error: 'กรุณากรอกชื่อและรหัสพนักงาน' })
  const employee = db.prepare('SELECT name_th, name_en FROM employee_directory WHERE employee_code = ?').get(employeeCode)
  const foldName = (name) => String(name || '').normalize('NFC').trim().toLocaleLowerCase()
  if (!employee || ![employee.name_th, employee.name_en].some((name) => name && foldName(name) === foldName(employeeName))) {
    return res.status(400).json({ error: 'ชื่อและรหัสพนักงานไม่ตรงกับฐานข้อมูล' })
  }
  if (!assessment.allow_multiple_attempts && db.prepare('SELECT id FROM assessment_submissions WHERE assessment_id = ? AND employee_code = ?').get(assessment.id, employeeCode)) {
    return res.status(409).json({ error: 'รหัสพนักงานนี้ส่งคำตอบแบบประเมินแล้ว' })
  }

  const questions = db.prepare('SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY order_index, id').all(assessment.id)
  if (!questions.length) return res.status(409).json({ error: 'แบบประเมินยังไม่มีข้อคำถาม' })
  const answers = req.body?.answers && typeof req.body.answers === 'object' && !Array.isArray(req.body.answers) ? req.body.answers : {}
  const snapshot = []
  let score = 0
  let maxScore = 0
  for (const question of questions) {
    const options = parseJson(question.options_json, [])
    const answer = String(answers[question.id] ?? '').trim()
    if (question.is_required && !answer) return res.status(400).json({ error: `กรุณาตอบ: ${question.prompt}` })
    if (question.question_type === 'choice' && answer && !options.includes(answer)) return res.status(400).json({ error: 'พบคำตอบที่ไม่ถูกต้อง กรุณาเลือกตัวเลือกจากแบบประเมิน' })
    if (question.question_type === 'text' && answer.length > 5000) return res.status(400).json({ error: 'คำตอบมีความยาวเกิน 5,000 ตัวอักษร' })
    const isScored = question.question_type === 'choice' && question.correct_option !== null
    const isCorrect = isScored && answer === options[question.correct_option]
    if (isScored && answer) {
      maxScore += 1
      if (isCorrect) score += 1
    }
    snapshot.push({ questionId: question.id, prompt: question.prompt, type: question.question_type, answer, isScored, isCorrect })
  }
  const submittedAt = nowIso()
  const id = randomUUID()
  db.prepare(`INSERT INTO assessment_submissions
    (id, assessment_id, employee_code, employee_name, answers_json, score, max_score, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, assessment.id, employeeCode, employeeName, JSON.stringify(snapshot), score, maxScore, submittedAt)
  res.status(201).json({ ok: true, score, maxScore, submittedAt })
})

app.get('/api/public/training-materials/:token', (req, res) => {
  const material = db.prepare('SELECT * FROM training_materials WHERE public_token = ? AND is_active = 1').get(req.params.token)
  if (!material) return res.status(404).json({ error: 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว' })
  res.set('Cache-Control', 'no-store').json({ material: {
    ...trainingMaterialDto(material),
    fileUrl: `/api/public/training-materials/${material.public_token}/file`,
    presentationUrl: material.companion_stored_name ? `/api/public/training-materials/${material.public_token}/presentation` : '',
  } })
})

app.post('/api/public/training-materials/:token/views', (req, res) => {
  const material = db.prepare('SELECT id FROM training_materials WHERE public_token = ? AND is_active = 1').get(req.params.token)
  if (!material) return res.status(404).json({ error: 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว' })
  const employeeCode = String(req.body?.employeeCode || '').trim().toUpperCase()
  const employeeName = String(req.body?.employeeName || '').trim()
  if (!employeeCode || !employeeName || employeeName.length > 160) return res.status(400).json({ error: 'กรุณาเลือกชื่อและรหัสพนักงานจากรายการทะเบียน' })
  const employee = db.prepare(`SELECT * FROM employee_directory WHERE UPPER(TRIM(employee_code)) = ?`).get(employeeCode)
  const foldName = (name) => String(name || '').normalize('NFC').trim().toLocaleLowerCase()
  if (!employee || ![employee.name_th, employee.name_en].some((name) => name && foldName(name) === foldName(employeeName))) {
    return res.status(400).json({ error: 'ชื่อและรหัสพนักงานไม่ตรงกับฐานข้อมูล' })
  }
  const viewedAt = nowIso()
  db.prepare(`INSERT INTO training_views (id, material_id, employee_code, employee_name, viewed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(material_id, employee_code) DO UPDATE SET employee_name = excluded.employee_name, viewed_at = excluded.viewed_at`)
    .run(randomUUID(), material.id, employee.employee_code, employee.name_th || employee.name_en, viewedAt)
  res.status(201).json({ ok: true, viewedAt })
})

app.get('/api/public/training-materials/:token/file', (req, res, next) => {
  const material = db.prepare('SELECT stored_name, original_name, mime_type FROM training_materials WHERE public_token = ? AND is_active = 1').get(req.params.token)
  if (!material) return res.status(404).json({ error: 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว' })
  const safeFilename = material.original_name.replace(/["\r\n]/g, '_')
  res.type(material.mime_type).set('X-Content-Type-Options', 'nosniff').set('Content-Disposition', `inline; filename="${safeFilename}"`)
  res.sendFile(path.join(trainingUploadDir, material.stored_name), (error) => error && next(error))
})

app.get('/api/public/training-materials/:token/presentation', (req, res, next) => {
  const material = db.prepare(`SELECT companion_stored_name, companion_original_name
    FROM training_materials WHERE public_token = ? AND is_active = 1`).get(req.params.token)
  if (!material?.companion_stored_name) return res.status(404).json({ error: 'ไม่พบไฟล์ PowerPoint หรือปิดการเผยแพร่แล้ว' })
  const safeFilename = material.companion_original_name.replace(/["\r\n]/g, '_')
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    .set('X-Content-Type-Options', 'nosniff')
    .set('Content-Disposition', `attachment; filename="${safeFilename}"`)
  res.sendFile(path.join(trainingUploadDir, material.companion_stored_name), (error) => error && next(error))
})

app.get('/api/admin/hiyari-forms', requireAdmin, (_req, res) => {
  const forms = db.prepare(`SELECT f.*, COUNT(s.id) AS submission_count
    FROM hiyari_forms f LEFT JOIN hiyari_submissions s ON s.form_id = f.id
    GROUP BY f.id ORDER BY f.created_at DESC, f.title COLLATE NOCASE`).all()
  res.json({ forms: forms.map(hiyariFormDto) })
})

app.post('/api/admin/hiyari-forms', requireAdmin, (req, res) => {
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  if (!title || title.length > 200 || description.length > 2000) return res.status(400).json({ error: 'กรุณาตรวจสอบชื่อและรายละเอียดแบบฟอร์ม' })
  const id = randomUUID()
  const timestamp = nowIso()
  db.prepare(`INSERT INTO hiyari_forms
    (id, public_token, title, description, is_active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(id, newPublicToken(), title, description, req.session.user.id, timestamp, timestamp)
  addAudit(req.session.user.id, 'สร้างแบบฟอร์ม Hiyari Hat', 'hiyari_form', id, { title })
  res.status(201).json({ form: hiyariFormDto(db.prepare('SELECT * FROM hiyari_forms WHERE id = ?').get(id)) })
})

app.patch('/api/admin/hiyari-forms/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM hiyari_forms WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม Hiyari Hat' })
  const title = String(req.body?.title ?? existing.title).trim()
  const description = String(req.body?.description ?? existing.description).trim()
  const isActive = req.body?.isActive === undefined ? Boolean(existing.is_active) : Boolean(req.body.isActive)
  if (!title || title.length > 200 || description.length > 2000) return res.status(400).json({ error: 'กรุณาตรวจสอบชื่อและรายละเอียดแบบฟอร์ม' })
  db.prepare('UPDATE hiyari_forms SET title = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?')
    .run(title, description, isActive ? 1 : 0, nowIso(), existing.id)
  addAudit(req.session.user.id, 'แก้ไขแบบฟอร์ม Hiyari Hat', 'hiyari_form', existing.id, { title, isActive })
  const form = db.prepare(`SELECT f.*, COUNT(s.id) AS submission_count FROM hiyari_forms f
    LEFT JOIN hiyari_submissions s ON s.form_id = f.id WHERE f.id = ? GROUP BY f.id`).get(existing.id)
  res.json({ form: hiyariFormDto(form) })
})

app.delete('/api/admin/hiyari-forms/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM hiyari_forms WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม Hiyari Hat' })
  const count = db.prepare('SELECT COUNT(*) AS count FROM hiyari_submissions WHERE form_id = ?').get(existing.id).count
  if (count) return res.status(409).json({ error: 'แบบฟอร์มมีรายงานที่บันทึกแล้ว กรุณาปิดลิงก์แทนการลบ' })
  db.prepare('DELETE FROM hiyari_forms WHERE id = ?').run(existing.id)
  addAudit(req.session.user.id, 'ลบแบบฟอร์ม Hiyari Hat', 'hiyari_form', existing.id, { title: existing.title })
  res.json({ ok: true })
})

app.get('/api/admin/hiyari-submissions', requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 500, 1), 2000)
  const formId = String(req.query.formId || '').trim()
  const rows = formId
    ? db.prepare(`SELECT s.*, f.title AS form_title FROM hiyari_submissions s
        JOIN hiyari_forms f ON f.id = s.form_id WHERE s.form_id = ? ORDER BY s.submitted_at DESC LIMIT ?`).all(formId, limit)
    : db.prepare(`SELECT s.*, f.title AS form_title FROM hiyari_submissions s
        JOIN hiyari_forms f ON f.id = s.form_id ORDER BY s.submitted_at DESC LIMIT ?`).all(limit)
  res.json({ submissions: rows.map(hiyariSubmissionDto) })
})

app.get('/api/admin/hiyari-submissions/export-by-employee.xlsx', requireAdmin, async (req, res, next) => {
  try {
    const from = String(req.query.from || '').trim()
    const to = String(req.query.to || '').trim()
    const validDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const date = new Date(`${value}T00:00:00.000Z`)
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    }
    if (Boolean(from) !== Boolean(to)) return res.status(400).json({ error: 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุดให้ครบ หรือเว้นว่างทั้งสองช่อง' })
    if (from && (!validDate(from) || !validDate(to))) return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง' })
    if (from && from > to) return res.status(400).json({ error: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด' })
    const rows = from
      ? db.prepare(`SELECT s.*, f.title AS form_title FROM hiyari_submissions s
          JOIN hiyari_forms f ON f.id = s.form_id
          WHERE s.report_date >= ? AND s.report_date <= ?
          ORDER BY s.employee_code COLLATE NOCASE, s.employee_name COLLATE NOCASE, s.report_date DESC, s.submitted_at DESC`).all(from, to)
      : db.prepare(`SELECT s.*, f.title AS form_title FROM hiyari_submissions s
          JOIN hiyari_forms f ON f.id = s.form_id
          ORDER BY s.employee_code COLLATE NOCASE, s.employee_name COLLATE NOCASE, s.report_date DESC, s.submitted_at DESC`).all()
    const language = ['th', 'en', 'my'].includes(String(req.query.lang || '')) ? String(req.query.lang) : 'th'
    const buffer = await createHiyariEmployeeSummaryWorkbook(rows, hiyariUploadDir, language, { from, to })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="hiyari-reports-by-employee-${from || 'all'}${to ? `-to-${to}` : ''}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
})

app.get('/api/admin/hiyari-submissions/:id/photos/:photoId', requireAdmin, (req, res, next) => {
  const row = db.prepare('SELECT photos_json FROM hiyari_submissions WHERE id = ?').get(req.params.id)
  const photo = row && parseJson(row.photos_json, []).find((item) => item.id === req.params.photoId)
  if (!photo) return res.status(404).json({ error: 'ไม่พบรูปภาพในรายงานนี้' })
  res.type('image/jpeg').set('X-Content-Type-Options', 'nosniff')
    .sendFile(path.join(hiyariUploadDir, path.basename(photo.storedName)), (error) => error && next(error))
})

app.get('/api/admin/hiyari-submissions/:id/export.xlsx', requireAdmin, async (req, res, next) => {
  try {
    const row = db.prepare(`SELECT s.*, f.title AS form_title FROM hiyari_submissions s
      JOIN hiyari_forms f ON f.id = s.form_id WHERE s.id = ?`).get(req.params.id)
    if (!row) return res.status(404).json({ error: 'ไม่พบรายงาน Hiyari Hat' })
    const buffer = await createHiyariWorkbook(row, hiyariUploadDir)
    const safeCode = row.employee_code.replace(/[^A-Za-z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="hiyari-${row.language}-${safeCode}-${row.report_date}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
})

app.get('/api/admin/assessments', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM assessments ORDER BY updated_at DESC, title COLLATE NOCASE').all()
  res.json({ assessments: rows.map(assessmentDto) })
})

app.post('/api/admin/assessments', requireAdmin, (req, res) => {
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const instructions = String(req.body?.instructions || '').trim()
  const questions = normalizedAssessmentQuestions(req.body?.questions ?? [])
  if (!title || title.length > 200 || description.length > 2000 || instructions.length > 4000 || !questions) return res.status(400).json({ error: 'กรุณาตรวจสอบชื่อ รายละเอียด และข้อคำถามของแบบประเมิน' })
  const id = randomUUID()
  const token = newPublicToken()
  const now = nowIso()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`INSERT INTO assessments
      (id, public_token, title, description, instructions, is_published, allow_multiple_attempts, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`)
      .run(id, token, title, description, instructions, req.body?.allowMultipleAttempts ? 1 : 0, req.session.user.id, now, now)
    saveAssessmentQuestions(id, questions)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  addAudit(req.session.user.id, 'สร้างแบบประเมิน', 'assessment', id, { title })
  res.status(201).json({ assessment: assessmentDto(db.prepare('SELECT * FROM assessments WHERE id = ?').get(id)) })
})

app.patch('/api/admin/assessments/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบแบบประเมิน' })
  const title = String(req.body?.title ?? existing.title).trim()
  const description = String(req.body?.description ?? existing.description).trim()
  const instructions = String(req.body?.instructions ?? existing.instructions).trim()
  const questions = req.body?.questions === undefined ? null : normalizedAssessmentQuestions(req.body.questions)
  const isPublished = req.body?.isPublished === undefined ? Boolean(existing.is_published) : Boolean(req.body.isPublished)
  const allowMultipleAttempts = req.body?.allowMultipleAttempts === undefined ? Boolean(existing.allow_multiple_attempts) : Boolean(req.body.allowMultipleAttempts)
  if (!title || title.length > 200 || description.length > 2000 || instructions.length > 4000 || (req.body?.questions !== undefined && !questions)) return res.status(400).json({ error: 'กรุณาตรวจสอบชื่อ รายละเอียด และข้อคำถามของแบบประเมิน' })
  const questionCount = questions ? questions.length : db.prepare('SELECT COUNT(*) AS count FROM assessment_questions WHERE assessment_id = ?').get(existing.id).count
  if (isPublished && questionCount === 0) return res.status(400).json({ error: 'เพิ่มข้อคำถามอย่างน้อย 1 ข้อก่อนเผยแพร่' })
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`UPDATE assessments SET title = ?, description = ?, instructions = ?, is_published = ?,
      allow_multiple_attempts = ?, updated_at = ? WHERE id = ?`)
      .run(title, description, instructions, isPublished ? 1 : 0, allowMultipleAttempts ? 1 : 0, nowIso(), existing.id)
    if (questions) saveAssessmentQuestions(existing.id, questions)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  addAudit(req.session.user.id, 'แก้ไขแบบประเมิน', 'assessment', existing.id, { title, isPublished })
  res.json({ assessment: assessmentDto(db.prepare('SELECT * FROM assessments WHERE id = ?').get(existing.id)) })
})

app.delete('/api/admin/assessments/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบแบบประเมิน' })
  db.prepare('DELETE FROM assessments WHERE id = ?').run(existing.id)
  addAudit(req.session.user.id, 'ลบแบบประเมิน', 'assessment', existing.id, { title: existing.title })
  res.json({ ok: true })
})

app.get('/api/admin/assessments/:id/submissions', requireAdmin, (req, res) => {
  const assessment = db.prepare('SELECT id, title FROM assessments WHERE id = ?').get(req.params.id)
  if (!assessment) return res.status(404).json({ error: 'ไม่พบแบบประเมิน' })
  const questions = db.prepare('SELECT id, prompt, question_type, options_json, correct_option, order_index FROM assessment_questions WHERE assessment_id = ? ORDER BY order_index, id').all(assessment.id).map(assessmentQuestionDto)
  const submissions = db.prepare('SELECT id, employee_code, employee_name, answers_json, score, max_score, submitted_at FROM assessment_submissions WHERE assessment_id = ? ORDER BY submitted_at DESC').all(assessment.id).map((row) => ({
    id: row.id, employeeCode: row.employee_code, employeeName: row.employee_name,
    answers: parseJson(row.answers_json, []), score: row.score, maxScore: row.max_score, submittedAt: row.submitted_at,
  }))
  res.json({ assessment, questions, submissions })
})

app.get('/api/admin/assessment-submissions', requireAdmin, (_req, res) => {
  const submissions = db.prepare(`SELECT s.id, a.title AS assessment_title, s.employee_code,
      s.employee_name, s.answers_json, s.score, s.max_score, s.submitted_at
    FROM assessment_submissions s JOIN assessments a ON a.id = s.assessment_id
    ORDER BY s.submitted_at DESC, a.title COLLATE NOCASE`).all().map((row) => ({
      id: row.id, assessmentTitle: row.assessment_title,
      employeeCode: row.employee_code, employeeName: row.employee_name,
      answers: parseJson(row.answers_json, []), score: row.score, maxScore: row.max_score,
      submittedAt: row.submitted_at,
    }))
  res.set('Cache-Control', 'no-store').json({ submissions })
})

app.get('/api/admin/assessment-submissions/export.xlsx', requireAdmin, async (_req, res, next) => {
  try {
    const rows = db.prepare(`SELECT s.id, a.title AS assessment_title, s.employee_code, s.employee_name,
        s.answers_json, s.score, s.max_score, s.submitted_at
      FROM assessment_submissions s JOIN assessments a ON a.id = s.assessment_id
      ORDER BY s.submitted_at DESC, a.title COLLATE NOCASE LIMIT 20001`).all()
    if (rows.length > 20000) return res.status(413).json({ error: 'รายงานมีมากกว่า 20,000 รายการ กรุณาส่งออกข้อมูลเป็นช่วง' })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Daily Safety | Y.T. Rubber'
    workbook.created = new Date()
    workbook.subject = 'Assessment submissions'
    workbook.title = 'Assessment submissions'

    const submissions = workbook.addWorksheet('Submissions', { views: [{ showGridLines: false }] })
    submissions.columns = [
      { header: 'Assessment', key: 'assessment', width: 38 },
      { header: 'Submitted at', key: 'submittedAt', width: 24 },
      { header: 'Employee name', key: 'employeeName', width: 28 },
      { header: 'Employee code', key: 'employeeCode', width: 18 },
      { header: 'Score', key: 'score', width: 12 },
      { header: 'Maximum score', key: 'maxScore', width: 16 },
    ]
    submissions.addRows(rows.map((row) => ({
      assessment: row.assessment_title, submittedAt: row.submitted_at, employeeName: row.employee_name,
      employeeCode: row.employee_code, score: row.score, maxScore: row.max_score,
    })))

    const answers = workbook.addWorksheet('Answers', { views: [{ showGridLines: false }] })
    answers.columns = [
      { header: 'Assessment', key: 'assessment', width: 38 },
      { header: 'Submitted at', key: 'submittedAt', width: 24 },
      { header: 'Employee name', key: 'employeeName', width: 28 },
      { header: 'Employee code', key: 'employeeCode', width: 18 },
      { header: 'Question', key: 'question', width: 54 },
      { header: 'Answer', key: 'answer', width: 42 },
      { header: 'Scored', key: 'scored', width: 12 },
      { header: 'Correct', key: 'correct', width: 12 },
    ]
    for (const row of rows) {
      for (const answer of parseJson(row.answers_json, [])) {
        answers.addRow({
          assessment: row.assessment_title, submittedAt: row.submitted_at,
          employeeName: row.employee_name, employeeCode: row.employee_code,
          question: answer.prompt || '', answer: answer.answer || '',
          scored: answer.isScored ? 'Yes' : 'No', correct: answer.isScored ? (answer.isCorrect ? 'Yes' : 'No') : '',
        })
      }
    }
    for (const sheet of [submissions, answers]) {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF105C54' } }
      sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }]
      sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}${Math.max(sheet.rowCount, 1)}` }
    }
    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="assessment-submissions.xlsx"')
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
})

app.get('/api/admin/assessments/:id/export.xlsx', requireAdmin, async (req, res, next) => {
  try {
    const assessment = db.prepare('SELECT id, title FROM assessments WHERE id = ?').get(req.params.id)
    if (!assessment) return res.status(404).json({ error: 'ไม่พบแบบประเมิน' })
    const questions = db.prepare('SELECT id, prompt, options_json, correct_option, order_index FROM assessment_questions WHERE assessment_id = ? ORDER BY order_index, id').all(assessment.id)
    const rows = db.prepare('SELECT employee_code, employee_name, answers_json, score, max_score, submitted_at FROM assessment_submissions WHERE assessment_id = ? ORDER BY submitted_at DESC').all(assessment.id)
    if (rows.length > 20000) return res.status(413).json({ error: 'รายงานมีมากกว่า 20,000 รายการ กรุณาส่งออกข้อมูลเป็นช่วง' })
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Daily Safety | Y.T. Rubber'
    workbook.created = new Date()
    workbook.subject = 'Assessment submissions'
    workbook.title = assessment.title
    const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] })
    summary.columns = [{ width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }]
    summary.mergeCells('A1:D1')
    summary.getCell('A1').value = 'ASSESSMENT SUMMARY'
    summary.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
    summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF105C54' } }
    summary.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    summary.getRow(1).height = 38
    summary.mergeCells('A2:D2')
    summary.getCell('A2').value = assessment.title
    summary.getCell('A2').font = { name: 'Aptos', size: 12, bold: true, color: { argb: 'FF23423F' } }
    summary.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3F1' } }
    summary.getCell('A2').alignment = { vertical: 'middle', indent: 1, wrapText: true }
    summary.getRow(2).height = 30

    const incorrectCount = rows.reduce((count, row) => count + parseJson(row.answers_json, []).filter((answer) => answer.isScored && !answer.isCorrect).length, 0)
    const employeeCount = new Set(rows.map((row) => row.employee_code)).size
    const exportedAt = formatBangkokParts(nowIso())
    const border = { style: 'thin', color: { argb: 'FFD5E3E0' } }
    const card = (labelRange, valueRange, label, value) => {
      summary.mergeCells(labelRange)
      summary.mergeCells(valueRange)
      const labelCell = summary.getCell(labelRange.split(':')[0])
      const valueCell = summary.getCell(valueRange.split(':')[0])
      labelCell.value = label
      labelCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF4E6965' } }
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F6F5' } }
      labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
      valueCell.value = value
      valueCell.font = { name: 'Aptos Display', size: 22, bold: true, color: { argb: 'FF105C54' } }
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFCFC' } }
      valueCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
      for (const range of [labelRange, valueRange]) {
        const [from, to] = range.split(':').map((address) => summary.getCell(address).address)
        const start = summary.getCell(from)
        const end = summary.getCell(to)
        for (let rowIndex = start.row; rowIndex <= end.row; rowIndex += 1) {
          for (let columnIndex = start.col; columnIndex <= end.col; columnIndex += 1) summary.getCell(rowIndex, columnIndex).border = { top: border, bottom: border, left: border, right: border }
        }
      }
    }
    card('A4:B4', 'A5:B6', 'Total submissions', rows.length)
    card('C4:D4', 'C5:D6', 'Employees', employeeCount)
    card('A8:B8', 'A9:B10', 'Incorrect answers', incorrectCount)
    summary.getCell('C8').value = 'Exported time'
    summary.getCell('D8').value = 'Exported date'
    for (const ref of ['C8', 'D8']) {
      const cell = summary.getCell(ref)
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF4E6965' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F6F5' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = { top: border, bottom: border, left: border, right: border }
    }
    summary.mergeCells('C9:C10')
    summary.mergeCells('D9:D10')
    summary.getCell('C9').value = exportedAt.time
    summary.getCell('D9').value = exportedAt.date
    for (const ref of ['C9', 'D9']) {
      const cell = summary.getCell(ref)
      cell.font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: 'FF105C54' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFCFC' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = { top: border, bottom: border, left: border, right: border }
    }
    summary.getRow(4).height = 25
    summary.getRow(5).height = 27
    summary.getRow(6).height = 27
    summary.getRow(8).height = 28
    summary.getRow(9).height = 27
    summary.getRow(10).height = 27
    summary.mergeCells('A12:D12')
    summary.getCell('A12').value = 'Y.T. RUBBER  ·  Daily Safety System'
    summary.getCell('A12').font = { name: 'Aptos', size: 9, color: { argb: 'FF728481' }, italic: true }
    summary.getCell('A12').alignment = { horizontal: 'right' }
    summary.getRow(12).height = 22
    summary.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
    const submissions = workbook.addWorksheet('Submissions', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
    const submissionHeaders = ['Submitted time', 'Submitted date', 'Employee ID', 'Employee name', 'Score', 'Max score']
    submissions.columns = submissionHeaders.map((header, index) => ({ header, key: `col${index}`, width: [16, 18, 18, 26, 12, 12][index] }))
    submissions.addRows(rows.map((row) => { const { time, date } = formatBangkokParts(row.submitted_at); return [time, date, row.employee_code, row.employee_name, row.score, row.max_score] }))
    styleReportSheet(submissions, submissionHeaders.length, rows.length)

    const wrongAnswers = workbook.addWorksheet('Incorrect answers', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
    const wrongHeaders = ['Submitted time', 'Submitted date', 'Employee ID', 'Employee name', 'Score', 'Max score', 'Question', 'Submitted answer', 'Correct answer']
    wrongAnswers.columns = wrongHeaders.map((header, index) => ({ header, key: `col${index}`, width: [16, 18, 18, 26, 12, 12, 42, 30, 30][index] }))
    const questionById = new Map(questions.map((question) => [question.id, question]))
    const incorrectRows = []
    for (const row of rows) {
      for (const answer of parseJson(row.answers_json, [])) {
        const question = questionById.get(answer.questionId)
        if (!question || !answer.isScored || answer.isCorrect) continue
        const options = parseJson(question.options_json, [])
        const { time, date } = formatBangkokParts(row.submitted_at)
        incorrectRows.push([
          time, date, row.employee_code, row.employee_name, row.score, row.max_score,
          question.prompt, answer.answer || '', options[question.correct_option] ?? '',
        ])
      }
    }
    wrongAnswers.addRows(incorrectRows)
    if (!incorrectRows.length) wrongAnswers.addRow(['No incorrect answers', '', '', '', '', '', '', '', ''])
    styleReportSheet(wrongAnswers, wrongHeaders.length, incorrectRows.length)
    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="assessment-report-${assessment.id}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
})

app.get('/api/admin/training-materials', requireAdmin, (_req, res) => {
  const materials = db.prepare('SELECT * FROM training_materials ORDER BY updated_at DESC, title COLLATE NOCASE').all()
  res.json({ materials: materials.map(trainingMaterialDto) })
})

app.post('/api/admin/training-materials', requireAdmin, trainingUpload.single('file'), async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  if (!title || title.length > 200 || description.length > 2000 || !req.file) return res.status(400).json({ error: 'กรุณากรอกชื่อเอกสารและแนบไฟล์' })
  const file = await persistTrainingFile(req.file)
  const id = randomUUID()
  const token = newPublicToken()
  const now = nowIso()
  try {
    db.prepare(`INSERT INTO training_materials
      (id, public_token, title, description, original_name, stored_name, mime_type, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
      .run(id, token, title, description, file.originalName, file.storedName, file.mimeType, req.session.user.id, now, now)
  } catch (error) {
    await unlink(path.join(trainingUploadDir, file.storedName)).catch(() => undefined)
    throw error
  }
  addAudit(req.session.user.id, 'เพิ่มสื่ออบรม', 'training_material', id, { title, mimeType: file.mimeType })
  res.status(201).json({ material: trainingMaterialDto(db.prepare('SELECT * FROM training_materials WHERE id = ?').get(id)) })
})

app.patch('/api/admin/training-materials/:id', requireAdmin, trainingUpload.single('file'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM training_materials WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบสื่ออบรม' })
  const title = String(req.body?.title ?? existing.title).trim()
  const description = String(req.body?.description ?? existing.description).trim()
  const isActive = req.body?.isActive === undefined ? Boolean(existing.is_active) : String(req.body.isActive) === 'true'
  if (!title || title.length > 200 || description.length > 2000) return res.status(400).json({ error: 'กรุณาตรวจสอบชื่อและรายละเอียดเอกสาร' })
  const file = await persistTrainingFile(req.file)
  const nextFile = file || { originalName: existing.original_name, storedName: existing.stored_name, mimeType: existing.mime_type }
  try {
    db.prepare(`UPDATE training_materials SET title = ?, description = ?, original_name = ?, stored_name = ?, mime_type = ?, is_active = ?, updated_at = ? WHERE id = ?`)
      .run(title, description, nextFile.originalName, nextFile.storedName, nextFile.mimeType, isActive ? 1 : 0, nowIso(), existing.id)
  } catch (error) {
    if (file) await unlink(path.join(trainingUploadDir, file.storedName)).catch(() => undefined)
    throw error
  }
  if (file) await unlink(path.join(trainingUploadDir, existing.stored_name)).catch(() => undefined)
  addAudit(req.session.user.id, 'แก้ไขสื่ออบรม', 'training_material', existing.id, { title, isActive, replacedFile: Boolean(file) })
  res.json({ material: trainingMaterialDto(db.prepare('SELECT * FROM training_materials WHERE id = ?').get(existing.id)) })
})

app.delete('/api/admin/training-materials/:id', requireAdmin, async (req, res) => {
  const existing = db.prepare('SELECT * FROM training_materials WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบสื่ออบรม' })
  db.prepare('DELETE FROM training_materials WHERE id = ?').run(existing.id)
  await unlink(path.join(trainingUploadDir, existing.stored_name)).catch(() => undefined)
  if (existing.companion_stored_name) await unlink(path.join(trainingUploadDir, existing.companion_stored_name)).catch(() => undefined)
  addAudit(req.session.user.id, 'ลบสื่ออบรม', 'training_material', existing.id, { title: existing.title })
  res.json({ ok: true })
})

app.get('/api/admin/employees', requireAdmin, (_req, res) => {
  const employees = db.prepare('SELECT * FROM employee_directory ORDER BY name_th COLLATE NOCASE, name_en COLLATE NOCASE, employee_code').all()
  res.json({ employees: employees.map(employeeDto) })
})

app.post('/api/admin/employees', requireAdmin, (req, res) => {
  const employee = employeeInput(req.body)
  if (!isValidEmployee(employee)) return res.status(400).json({ error: 'กรุณาตรวจสอบรหัส ชื่อ ตำแหน่ง และแผนก' })
  if (db.prepare('SELECT employee_code FROM employee_directory WHERE employee_code = ?').get(employee.employeeCode)) {
    return res.status(409).json({ error: 'รหัสพนักงานนี้มีในระบบแล้ว' })
  }
  const now = nowIso()
  db.prepare(`INSERT INTO employee_directory
    (employee_code, name_th, name_en, position_th, position_en, department_th, department_en, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(employee.employeeCode, employee.nameTh, employee.nameEn, employee.positionTh, employee.positionEn, employee.departmentTh, employee.departmentEn, now, now)
  addAudit(req.session.user.id, 'เพิ่มข้อมูลพนักงาน', 'employee', employee.employeeCode, { nameTh: employee.nameTh, nameEn: employee.nameEn })
  res.status(201).json({ employee: employeeDto(db.prepare('SELECT * FROM employee_directory WHERE employee_code = ?').get(employee.employeeCode)) })
})

app.patch('/api/admin/employees/:code', requireAdmin, (req, res) => {
  const oldCode = String(req.params.code || '').toUpperCase()
  const existing = db.prepare('SELECT * FROM employee_directory WHERE employee_code = ?').get(oldCode)
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' })
  const employee = employeeInput(req.body, existing)
  if (!isValidEmployee(employee)) return res.status(400).json({ error: 'กรุณาตรวจสอบรหัส ชื่อ ตำแหน่ง และแผนก' })
  const duplicate = db.prepare('SELECT employee_code FROM employee_directory WHERE employee_code = ? AND employee_code != ?').get(employee.employeeCode, oldCode)
  if (duplicate) return res.status(409).json({ error: 'รหัสพนักงานนี้มีในระบบแล้ว' })
  db.prepare(`UPDATE employee_directory SET employee_code = ?, name_th = ?, name_en = ?,
    position_th = ?, position_en = ?, department_th = ?, department_en = ?, updated_at = ?
    WHERE employee_code = ?`)
    .run(employee.employeeCode, employee.nameTh, employee.nameEn, employee.positionTh, employee.positionEn, employee.departmentTh, employee.departmentEn, nowIso(), oldCode)
  addAudit(req.session.user.id, 'แก้ไขข้อมูลพนักงาน', 'employee', employee.employeeCode, { previousCode: oldCode, nameTh: employee.nameTh, nameEn: employee.nameEn })
  res.json({ employee: employeeDto(db.prepare('SELECT * FROM employee_directory WHERE employee_code = ?').get(employee.employeeCode)) })
})

app.delete('/api/admin/employees/:code', requireAdmin, (req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  const existing = db.prepare('SELECT * FROM employee_directory WHERE employee_code = ?').get(code)
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' })
  db.prepare('DELETE FROM employee_directory WHERE employee_code = ?').run(code)
  addAudit(req.session.user.id, 'ลบข้อมูลพนักงาน', 'employee', code, { nameTh: existing.name_th, nameEn: existing.name_en })
  res.json({ ok: true })
})

app.get('/api/admin/employees/:code/report', requireAdmin, (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase()
  const employeeRow = db.prepare('SELECT * FROM employee_directory WHERE UPPER(TRIM(employee_code)) = ?').get(code)
  if (!employeeRow) return res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' })
  const employee = employeeDto(employeeRow)
  const accountIds = db.prepare('SELECT id FROM users WHERE UPPER(TRIM(employee_code)) = ?').all(employee.employeeCode).map((row) => row.id)
  const responsibleNames = [...new Set([employee.name_th, employee.name_en].filter(Boolean).map((name) => name.trim().toLocaleLowerCase()))]
  const assignmentClauses = []
  const assignmentParams = []
  if (accountIds.length) {
    assignmentClauses.push(`r.responsible_user_id IN (${accountIds.map(() => '?').join(',')})`)
    assignmentParams.push(...accountIds)
  }
  if (responsibleNames.length) {
    assignmentClauses.push(`LOWER(TRIM(r.responsible)) IN (${responsibleNames.map(() => '?').join(',')})`)
    assignmentParams.push(...responsibleNames)
  }
  const assignmentWhere = `r.result = 'NG' AND (${assignmentClauses.join(' OR ') || '0'})`
  const summary = {
    inspections: db.prepare('SELECT COUNT(*) AS count FROM inspections WHERE UPPER(TRIM(employee_code)) = ?').get(employee.employeeCode).count,
    correctiveTasks: db.prepare(`SELECT COUNT(*) AS count FROM responses r WHERE ${assignmentWhere}`).get(...assignmentParams).count,
    openTasks: db.prepare(`SELECT COUNT(*) AS count FROM responses r WHERE ${assignmentWhere} AND r.follow_up_status != 'แก้ไขแล้ว'`).get(...assignmentParams).count,
    assessments: db.prepare('SELECT COUNT(*) AS count FROM assessment_submissions WHERE UPPER(TRIM(employee_code)) = ?').get(employee.employeeCode).count,
    trainingViews: db.prepare('SELECT COUNT(*) AS count FROM training_views WHERE UPPER(TRIM(employee_code)) = ?').get(employee.employeeCode).count,
    hiyariReports: db.prepare('SELECT COUNT(*) AS count FROM hiyari_submissions WHERE UPPER(TRIM(employee_code)) = ?').get(employee.employeeCode).count,
  }
  const inspections = db.prepare(`SELECT i.id, i.inspection_date, i.inspection_time, i.department_area, i.shift,
      SUM(CASE WHEN r.result = 'OK' THEN 1 ELSE 0 END) AS ok_count,
      SUM(CASE WHEN r.result = 'NG' THEN 1 ELSE 0 END) AS ng_count,
      SUM(CASE WHEN r.result = 'N/A' THEN 1 ELSE 0 END) AS na_count
    FROM inspections i LEFT JOIN responses r ON r.inspection_id = i.id
    WHERE UPPER(TRIM(i.employee_code)) = ? GROUP BY i.id
    ORDER BY i.inspection_date DESC, i.inspection_time DESC, i.created_at DESC LIMIT 100`)
    .all(employee.employeeCode).map((row) => ({
      id: row.id, date: row.inspection_date, time: row.inspection_time, area: row.department_area, shift: row.shift,
      counts: { ok: row.ok_count || 0, ng: row.ng_count || 0, na: row.na_count || 0 },
    }))
  const correctiveTasks = db.prepare(`SELECT r.id, i.id AS inspection_id, i.inspection_date, i.inspection_time, i.department_area,
      r.item_title, r.issue_details, r.follow_up_status, r.due_date, r.resolution_note,
      (SELECT COUNT(*) FROM attachments a WHERE a.response_id = r.id AND a.attachment_type = 'before') AS before_photos,
      (SELECT COUNT(*) FROM attachments a WHERE a.response_id = r.id AND a.attachment_type = 'after') AS after_photos
    FROM responses r JOIN inspections i ON i.id = r.inspection_id
    WHERE ${assignmentWhere}
    ORDER BY CASE WHEN r.follow_up_status = 'แก้ไขแล้ว' THEN 1 ELSE 0 END, i.inspection_date DESC, i.inspection_time DESC LIMIT 200`)
    .all(...assignmentParams).map((row) => ({
      id: row.id, inspectionId: row.inspection_id, date: row.inspection_date, time: row.inspection_time,
      area: row.department_area, title: row.item_title, issueDetails: row.issue_details,
      followUpStatus: row.follow_up_status, dueDate: row.due_date, resolutionNote: row.resolution_note,
      beforePhotos: row.before_photos, afterPhotos: row.after_photos,
    }))
  const assessments = db.prepare(`SELECT s.id, a.title, s.score, s.max_score, s.submitted_at
    FROM assessment_submissions s JOIN assessments a ON a.id = s.assessment_id
    WHERE UPPER(TRIM(s.employee_code)) = ? ORDER BY s.submitted_at DESC LIMIT 200`)
    .all(employee.employeeCode).map((row) => ({ id: row.id, title: row.title, score: row.score, maxScore: row.max_score, submittedAt: row.submitted_at }))
  const trainingViews = db.prepare(`SELECT v.id, m.title, v.viewed_at FROM training_views v
    JOIN training_materials m ON m.id = v.material_id
    WHERE UPPER(TRIM(v.employee_code)) = ? ORDER BY v.viewed_at DESC LIMIT 200`)
    .all(employee.employeeCode).map((row) => ({ id: row.id, title: row.title, viewedAt: row.viewed_at }))
  const hiyariReports = db.prepare(`SELECT s.id, f.title, s.language, s.report_date, s.when_text, s.where_text,
      s.what_happened, s.suggestions, s.note, s.submitted_at
    FROM hiyari_submissions s JOIN hiyari_forms f ON f.id = s.form_id
    WHERE UPPER(TRIM(s.employee_code)) = ? ORDER BY s.submitted_at DESC LIMIT 200`)
    .all(employee.employeeCode).map((row) => ({
      id: row.id, title: row.title, language: row.language, reportDate: row.report_date,
      whenText: row.when_text, whereText: row.where_text, whatHappened: row.what_happened,
      suggestions: row.suggestions, note: row.note, submittedAt: row.submitted_at,
    }))
  res.set('Cache-Control', 'no-store').json({ employee, summary, inspections, correctiveTasks, assessments, trainingViews, hiyariReports })
})

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const users = db.prepare('SELECT id, username, display_name, employee_code, role, is_active FROM users ORDER BY is_active DESC, role, display_name').all()
  res.json({ users: users.map(safeUser) })
})
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const displayName = String(req.body?.name || '').trim()
  const employeeCode = String(req.body?.employeeCode || '').trim()
  const password = String(req.body?.password || '')
  const role = String(req.body?.role || 'leader')
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 3–32 ตัว ใช้ a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง' })
  if (!displayName || !employeeCode) return res.status(400).json({ error: 'กรุณากรอกชื่อและรหัสพนักงาน' })
  if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' })
  if (!['admin', 'leader', 'employee'].includes(role)) return res.status(400).json({ error: 'ประเภทผู้ใช้ไม่ถูกต้อง' })
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้มีในระบบแล้ว' })
  const id = randomUUID()
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, employee_code, role, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, username, await bcrypt.hash(password, 10), displayName, employeeCode, role, nowIso())
  addAudit(req.session.user.id, 'สร้างบัญชีผู้ใช้', 'user', id, { username, role })
  res.status(201).json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) })
})
app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' })
  const username = String(req.body?.username ?? existing.username).trim().toLowerCase()
  const displayName = String(req.body?.name ?? existing.display_name).trim()
  const employeeCode = String(req.body?.employeeCode ?? existing.employee_code).trim()
  const role = String(req.body?.role ?? existing.role)
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 3–32 ตัว ใช้ a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง' })
  if (!displayName || !employeeCode) return res.status(400).json({ error: 'กรุณากรอกชื่อและรหัสพนักงาน' })
  if (!['admin', 'leader', 'employee'].includes(role)) return res.status(400).json({ error: 'ประเภทผู้ใช้ไม่ถูกต้อง' })
  const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, existing.id)
  if (duplicate) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้มีในระบบแล้ว' })
  const isDemotingAdmin = existing.role === 'admin' && role !== 'admin'
  if (isDemotingAdmin && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get().count <= 1) {
    return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อย 1 บัญชี' })
  }
  if (existing.id === req.session.user.id && role !== 'admin') return res.status(400).json({ error: 'ไม่สามารถลดสิทธิ์บัญชีที่กำลังใช้งานได้' })
  db.prepare('UPDATE users SET username = ?, display_name = ?, employee_code = ?, role = ? WHERE id = ?')
    .run(username, displayName, employeeCode, role, existing.id)
  const updated = safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id))
  addAudit(req.session.user.id, 'แก้ไขบัญชีผู้ใช้', 'user', existing.id, { username, role })
  if (existing.id === req.session.user.id) {
    req.session.user = updated
    return req.session.save((error) => {
      if (error) return res.status(500).json({ error: 'บันทึกบัญชีไม่สำเร็จ' })
      res.json({ user: updated })
    })
  }
  res.json({ user: updated })
})
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' })
  if (existing.id === req.session.user.id) return res.status(400).json({ error: 'ไม่สามารถปิดใช้งานบัญชีที่กำลังเข้าสู่ระบบได้' })
  if (!existing.is_active) return res.json({ user: safeUser(existing) })
  if (existing.role === 'admin' && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get().count <= 1) {
    return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อย 1 บัญชี' })
  }
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(existing.id)
  addAudit(req.session.user.id, 'ปิดใช้งานบัญชีผู้ใช้', 'user', existing.id, { username: existing.username })
  res.json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id)) })
})
app.patch('/api/admin/users/:id/status', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' })
  if (req.body?.isActive !== true) return res.status(400).json({ error: 'สถานะบัญชีไม่ถูกต้อง' })
  if (existing.is_active) return res.json({ user: safeUser(existing) })
  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(existing.id)
  addAudit(req.session.user.id, 'เปิดใช้งานบัญชีผู้ใช้', 'user', existing.id, { username: existing.username })
  res.json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id)) })
})
app.patch('/api/admin/users/:id/password', requireAdmin, async (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้' })
  const password = String(req.body?.password || '')
  if (password.length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' })
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 10), user.id)
  addAudit(req.session.user.id, 'เปลี่ยนรหัสผ่านผู้ใช้', 'user', user.id, { username: user.username })
  res.json({ ok: true })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบ API ที่ร้องขอ' }))

const distDir = path.join(appRoot, 'dist')
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

async function sendPageWithMetadata(res, next, { title, description, url }) {
  try {
    let html = await readFile(path.join(distDir, 'index.html'), 'utf8')
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeHtml(description)}" />`)
    const metadata = [
      ['og:title', title], ['og:description', description], ['og:type', 'website'], ['og:url', url],
      ['twitter:card', 'summary'], ['twitter:title', title], ['twitter:description', description],
    ].map(([property, content]) => `<meta property="${property}" content="${escapeHtml(content)}" />`).join('')
    html = html.replace('</head>', `${metadata}</head>`)
    res.type('html').send(html)
  } catch (error) { next(error) }
}

app.get(/^\/(assessment|training|hiyari)(?:\/.*)?$/, async (req, res, next) => {
  const route = req.path.split('/').filter(Boolean)
  const type = route[0]
  let token = ''
  try { token = decodeURIComponent(route.at(-1) || '') } catch { return res.status(404).send('Not found') }
  const lookups = {
    assessment: { sql: 'SELECT title, description FROM assessments WHERE public_token = ? AND is_published = 1', label: 'แบบประเมินความปลอดภัย' },
    training: { sql: 'SELECT title, description FROM training_materials WHERE public_token = ? AND is_active = 1', label: 'สื่ออบรมความปลอดภัย' },
    hiyari: { sql: 'SELECT title, description FROM hiyari_forms WHERE public_token = ? AND is_active = 1', label: 'Hiyari Hat' },
  }
  const config = lookups[type]
  const item = token ? db.prepare(config.sql).get(token) : null
  const title = item?.title || config.label
  const description = item?.description || `เปิดแบบฟอร์ม ${title} ในระบบความปลอดภัย Y.T. Rubber`
  await sendPageWithMetadata(res, next, { title: `${title} | ${config.label} | Y.T. Rubber`, description, url: `${req.protocol}://${req.get('host')}${req.originalUrl}` })
})

app.get('/daily-inspection', async (req, res, next) => {
  await sendPageWithMetadata(res, next, {
    title: 'แบบตรวจความปลอดภัยประจำวัน | Daily Safety | Y.T. Rubber',
    description: 'เปิดแบบตรวจความปลอดภัยประจำวัน Y.T. Rubber',
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  })
})

app.use(express.static(distDir))
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'index.html'), (error) => error && next(error))
})

app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const isTrainingUpload = req.path.startsWith('/api/admin/training-materials')
    const isHiyariUpload = req.path.startsWith('/api/public/hiyari/')
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? (isTrainingUpload ? 'ไฟล์สื่ออบรมมีขนาดเกิน 25 MB' : 'รูปภาพมีขนาดเกิน 8 MB ต่อรูป')
      : (isTrainingUpload ? 'แนบไฟล์สื่ออบรมได้ครั้งละ 1 ไฟล์' : isHiyariUpload ? 'แนบรูปภาพ Hiyari Hat ได้ไม่เกิน 5 รูปต่อรายงาน' : 'แนบรูปภาพได้ไม่เกิน 20 รูปต่อครั้ง')
    return res.status(400).json({ error: message })
  }
  if (error.status === 400) return res.status(400).json({ error: error.message })
  console.error(error)
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองอีกครั้ง' })
})

app.listen(port, host, () => {
  console.log(`Daily Safety running at http://localhost:${port}`)
  if (!isProduction) console.log('Demo accounts: admin / Admin@123 and leader / Leader@123')
})
