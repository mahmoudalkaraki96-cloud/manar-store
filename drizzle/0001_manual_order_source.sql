ALTER TABLE orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'storefront';
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN order_source_channel TEXT;
