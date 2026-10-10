CREATE TABLE IF NOT EXISTS store_cart_snapshots (
 cart_id TEXT PRIMARY KEY,
 quantity INTEGER NOT NULL CHECK(quantity >= 0),
 products_count INTEGER NOT NULL CHECK(products_count >= 0),
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_cart_snapshots_updated ON store_cart_snapshots(updated_at);
