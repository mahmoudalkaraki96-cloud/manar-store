-- One-time cleanup authorized by the store owner on 2026-09-30.
-- All existing orders were test/fake orders. New orders created after this migration are unaffected.
CREATE TABLE IF NOT EXISTS order_extra_fees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 label TEXT NOT NULL,
 amount_agorot INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
DELETE FROM order_extra_fees;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM sqlite_sequence WHERE name IN ('order_extra_fees','order_items','orders');
