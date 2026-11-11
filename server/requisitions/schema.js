/** Requisition and workflow tables. Template steps are copied into requisition_steps on submit (snapshot). */
export function migrateRequisitions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applies_type TEXT NOT NULL CHECK(applies_type IN ('ppe', 'medicine', 'any')),
      warehouse_id TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_steps (
      template_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      approver_type TEXT NOT NULL CHECK(approver_type IN ('dept_supervisor', 'role', 'user', 'warehouse_staff')),
      approver_ref TEXT NOT NULL DEFAULT '',
      condition_json TEXT NOT NULL DEFAULT '{}',
      mode TEXT NOT NULL DEFAULT 'any' CHECK(mode IN ('any', 'all')),
      sla_hours INTEGER NOT NULL DEFAULT 0,
      escalate_type TEXT NOT NULL DEFAULT 'none' CHECK(escalate_type IN ('none', 'role', 'user')),
      escalate_ref TEXT NOT NULL DEFAULT '',
      allow_edit_qty INTEGER NOT NULL DEFAULT 0 CHECK(allow_edit_qty IN (0, 1)),
      PRIMARY KEY (template_id, position)
    );
    CREATE TABLE IF NOT EXISTS department_supervisors (
      department TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_backup INTEGER NOT NULL DEFAULT 0 CHECK(is_backup IN (0, 1)),
      PRIMARY KEY (department, user_id)
    );
    CREATE TABLE IF NOT EXISTS delegations (
      id TEXT PRIMARY KEY,
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ppe', 'medicine')),
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, type)
    );
    CREATE TABLE IF NOT EXISTS cart_lines (
      cart_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK(qty > 0),
      PRIMARY KEY (cart_id, variant_id)
    );
    CREATE TABLE IF NOT EXISTS requisitions (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('ppe', 'medicine')),
      requester_id TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT '',
      warehouse_id TEXT NOT NULL,
      template_id TEXT NOT NULL DEFAULT '',
      template_version INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      needed_by TEXT NOT NULL DEFAULT '',
      current_step INTEGER NOT NULL DEFAULT 0,
      approved_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requisitions_requester ON requisitions(requester_id);
    CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status);
    CREATE TABLE IF NOT EXISTS requisition_lines (
      id TEXT PRIMARY KEY,
      requisition_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      qty_requested INTEGER NOT NULL CHECK(qty_requested > 0),
      qty_approved INTEGER NOT NULL DEFAULT 0,
      qty_issued INTEGER NOT NULL DEFAULT 0,
      qty_returned INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_requisition_lines_req ON requisition_lines(requisition_id);
    CREATE TABLE IF NOT EXISTS requisition_steps (
      requisition_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      approver_type TEXT NOT NULL,
      approver_ref TEXT NOT NULL DEFAULT '',
      condition_json TEXT NOT NULL DEFAULT '{}',
      mode TEXT NOT NULL DEFAULT 'any',
      sla_hours INTEGER NOT NULL DEFAULT 0,
      escalate_type TEXT NOT NULL DEFAULT 'none',
      escalate_ref TEXT NOT NULL DEFAULT '',
      allow_edit_qty INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'approved', 'skipped')),
      approvers_json TEXT NOT NULL DEFAULT '[]',
      approvals_json TEXT NOT NULL DEFAULT '[]',
      due_at TEXT NOT NULL DEFAULT '',
      escalated INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (requisition_id, position)
    );
    CREATE TABLE IF NOT EXISTS requisition_events (
      id TEXT PRIMARY KEY,
      requisition_id TEXT NOT NULL,
      step INTEGER NOT NULL DEFAULT 0,
      actor_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requisition_events_req ON requisition_events(requisition_id);
    CREATE TRIGGER IF NOT EXISTS requisition_events_no_update BEFORE UPDATE ON requisition_events
      BEGIN SELECT RAISE(ABORT, 'requisition_events is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS requisition_events_no_delete BEFORE DELETE ON requisition_events
      BEGIN SELECT RAISE(ABORT, 'requisition_events is append-only'); END;
    CREATE TABLE IF NOT EXISTS requisition_counters (
      year INTEGER PRIMARY KEY,
      last INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS requisition_photos (
      id TEXT PRIMARY KEY,
      requisition_id TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      thumb_name TEXT NOT NULL,
      original_name TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requisition_photos_req ON requisition_photos(requisition_id);
  `)

  // Two default templates (one supervisor approval) so requisitions work before an admin designs anything.
  if (db.prepare('SELECT COUNT(*) AS n FROM workflow_templates').get().n === 0) {
    const stamp = new Date().toISOString()
    const insertTemplate = db.prepare('INSERT INTO workflow_templates (id, name, applies_type, warehouse_id, version, is_active, created_at) VALUES (?, ?, ?, \'\', 1, 1, ?)')
    const insertStep = db.prepare('INSERT INTO workflow_steps (template_id, position, name, approver_type, approver_ref, mode) VALUES (?, 1, ?, \'dept_supervisor\', \'\', \'any\')')
    for (const [id, name, type] of [['default-ppe', 'เบิก PPE', 'ppe'], ['default-medicine', 'เบิกยา', 'medicine']]) {
      insertTemplate.run(id, name, type, stamp)
      insertStep.run(id, 'หัวหน้างานอนุมัติ')
    }
  }
}
