CREATE TABLE IF NOT EXISTS admin_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  account_id INTEGER,
  request_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_customer_account_unique ON admin_customers(account_id) WHERE account_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS admin_customer_orders (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  customer_id INTEGER NOT NULL REFERENCES admin_customers(id),
  linked_at INTEGER NOT NULL,
  request_id TEXT UNIQUE,
  request_hash TEXT
);
CREATE INDEX IF NOT EXISTS admin_customer_orders_customer ON admin_customer_orders(customer_id);
CREATE TABLE IF NOT EXISTS admin_customer_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES admin_customers(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount_agorot INTEGER NOT NULL CHECK(amount_agorot > 0),
  note TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_customer_payments_order ON admin_customer_payments(order_id);

