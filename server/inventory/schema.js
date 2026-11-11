/** Inventory tables. Ids are TEXT (randomUUID) like the rest of the app; stock movements are append-only. */
export function migrateInventory(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ppe', 'medicine')),
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ppe', 'medicine')),
      category_id TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      min_stock INTEGER NOT NULL DEFAULT 0,
      track_lot INTEGER NOT NULL DEFAULT 0 CHECK(track_lot IN (0, 1)),
      track_expiry INTEGER NOT NULL DEFAULT 0 CHECK(track_expiry IN (0, 1)),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS item_variants (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS idx_item_variants_item ON item_variants(item_id);
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      type TEXT NOT NULL DEFAULT 'any' CHECK(type IN ('any', 'ppe', 'medicine'))
    );
    CREATE TABLE IF NOT EXISTS warehouse_staff (
      warehouse_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (warehouse_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS stock_lots (
      id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      lot_no TEXT NOT NULL DEFAULT '',
      expiry_date TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL,
      UNIQUE (variant_id, warehouse_id, lot_no)
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      lot_id TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL,
      ref_type TEXT NOT NULL DEFAULT '',
      ref_id TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id, warehouse_id);
    CREATE TRIGGER IF NOT EXISTS stock_movements_no_update BEFORE UPDATE ON stock_movements
      BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS stock_movements_no_delete BEFORE DELETE ON stock_movements
      BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
    CREATE TABLE IF NOT EXISTS stock_balances (
      variant_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      lot_id TEXT NOT NULL DEFAULT '',
      on_hand INTEGER NOT NULL DEFAULT 0 CHECK(on_hand >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
      PRIMARY KEY (variant_id, warehouse_id, lot_id)
    );
    CREATE TABLE IF NOT EXISTS stock_reservations (
      id TEXT PRIMARY KEY,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      lot_id TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK(qty > 0),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stock_reservations_ref ON stock_reservations(ref_type, ref_id);
    CREATE TABLE IF NOT EXISTS stock_counts (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'counting', 'posted')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      posted_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stock_count_lines (
      count_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      lot_id TEXT NOT NULL DEFAULT '',
      system_qty INTEGER NOT NULL,
      counted_qty INTEGER,
      PRIMARY KEY (count_id, variant_id, lot_id)
    );
  `)
  // Warehouses created before types existed hold anything.
  if (!db.prepare('PRAGMA table_info(warehouses)').all().some((column) => column.name === 'type')) {
    db.exec("ALTER TABLE warehouses ADD COLUMN type TEXT NOT NULL DEFAULT 'any' CHECK(type IN ('any', 'ppe', 'medicine'))")
  }
}
