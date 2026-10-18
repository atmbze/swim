import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const BASELINE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  category TEXT NOT NULL,
  condition TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  city TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  flag_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_cat ON listings(category);
CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, reporter_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  offer_id INTEGER REFERENCES offers(id),
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  promo_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS buyback_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  condition TEXT NOT NULL,
  asking_cents INTEGER,
  quote_cents INTEGER,
  admin_note TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  title TEXT NOT NULL,
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 90),
  seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  category TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Migrations run in version order inside a transaction each; the applied
 * version is recorded in schema_migrations. The baseline (v1) is idempotent
 * (CREATE TABLE IF NOT EXISTS), so pre-existing databases adopt it cleanly.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: "baseline", sql: BASELINE },
  {
    version: 2,
    name: "offer_inventory_reservation",
    sql: `
ALTER TABLE listings ADD COLUMN reserved_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offers ADD COLUMN expires_at TEXT;
`,
  },
];

export function migrate(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version)
  );
  const known = new Set(MIGRATIONS.map((m) => m.version));
  for (const v of applied) {
    if (!known.has(v)) throw new Error(`Database is at migration ${v}, newer than this code knows — update the app first`);
  }
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(m.version);
    })();
  }
}

export function currentSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  return row.v ?? 0;
}
