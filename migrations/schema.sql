CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password      TEXT    NOT NULL,
  balance       REAL    NOT NULL DEFAULT 0,
  total_spent   REAL    NOT NULL DEFAULT 0,
  total_orders  INTEGER NOT NULL DEFAULT 0,
  api_key       TEXT    NOT NULL UNIQUE,
  referral_code TEXT    NOT NULL UNIQUE,
  referred_by   INTEGER REFERENCES users(id),
  role          TEXT    NOT NULL DEFAULT 'user',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  provider_order_id TEXT,
  service_id        TEXT    NOT NULL,
  service_name      TEXT,
  link              TEXT    NOT NULL,
  quantity          INTEGER NOT NULL,
  charge            REAL    NOT NULL DEFAULT 0,
  start_count       INTEGER NOT NULL DEFAULT 0,
  remains           INTEGER NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'Pending',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT    NOT NULL,
  amount      REAL    NOT NULL,
  description TEXT    NOT NULL,
  ref_id      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  subject     TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'Other',
  message     TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'Open',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id    TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  category      TEXT    NOT NULL,
  rate          REAL    NOT NULL DEFAULT 0,
  min_order     INTEGER NOT NULL DEFAULT 10,
  max_order     INTEGER NOT NULL DEFAULT 100000,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
