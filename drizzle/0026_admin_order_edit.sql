ALTER TABLE orders ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN inventory_committed INTEGER DEFAULT 0;
UPDATE orders SET inventory_committed=1 WHERE status IN ('confirmed','preparing','shipped','delivered');
-- Legacy cancelled orders have no reliable record of whether stock was deducted.
UPDATE orders SET inventory_committed=NULL WHERE status='cancelled';
CREATE TABLE order_edit_guards(token TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
