-- Skema database toko akrilik (Cloudflare D1 / SQLite).
-- Aman dijalankan berulang: semua pakai IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'plakat',
  description       TEXT NOT NULL DEFAULT '',
  min_w             REAL NOT NULL,
  max_w             REAL NOT NULL,
  min_h             REAL NOT NULL,
  max_h             REAL NOT NULL,
  default_w         REAL NOT NULL,
  default_h         REAL NOT NULL,
  thickness_options TEXT NOT NULL,
  default_thickness REAL NOT NULL,
  finish_options    TEXT NOT NULL,
  shape_options     TEXT NOT NULL,
  extra_options     TEXT NOT NULL DEFAULT '[]',
  min_price         INTEGER NOT NULL DEFAULT 0,
  setup_fee         INTEGER NOT NULL DEFAULT 0,
  max_qty           INTEGER NOT NULL DEFAULT 1000,
  sort              INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS materials (
  thickness_mm  REAL PRIMARY KEY,
  price_per_cm2 REAL NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS finishes (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  uv_per_cm2  REAL NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shapes (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'rect',
  factor      REAL NOT NULL DEFAULT 1,
  estimated   INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS extras (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'menunggu_pembayaran',
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  delivery      TEXT NOT NULL DEFAULT 'ambil',
  address       TEXT,
  city          TEXT,
  note          TEXT,
  subtotal      INTEGER NOT NULL,
  shipping_fee  INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL,
  proof_key     TEXT,
  tracking_no   TEXT,
  admin_note    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone  ON orders (phone);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  thickness    REAL NOT NULL,
  finish       TEXT NOT NULL,
  finish_name  TEXT NOT NULL,
  shape        TEXT NOT NULL,
  shape_name   TEXT NOT NULL,
  extras       TEXT NOT NULL DEFAULT '[]',
  qty          INTEGER NOT NULL,
  unit_price   INTEGER NOT NULL,
  discount     INTEGER NOT NULL DEFAULT 0,
  setup_fee    INTEGER NOT NULL DEFAULT 0,
  line_total   INTEGER NOT NULL,
  design_key   TEXT,
  design_name  TEXT,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events (order_id, id);

CREATE TABLE IF NOT EXISTS gallery (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  material_note TEXT NOT NULL DEFAULT '',
  product_slug  TEXT,
  image_key     TEXT NOT NULL,
  published     INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gallery_pub ON gallery (published, id);

-- Metadata semua file yang diunggah. Kolom data terisi hanya jika R2 tidak dipasang.
CREATE TABLE IF NOT EXISTS files (
  key        TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       TEXT,
  created_at INTEGER NOT NULL
);

-- Pembatas laju permintaan (anti-spam).
CREATE TABLE IF NOT EXISTS rl (
  k  TEXT PRIMARY KEY,
  n  INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
