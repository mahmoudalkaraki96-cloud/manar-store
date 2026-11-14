ALTER TABLE products ADD COLUMN translations TEXT NOT NULL DEFAULT '{}';
ALTER TABLE categories ADD COLUMN translations TEXT NOT NULL DEFAULT '{}';
ALTER TABLE product_option_values ADD COLUMN translations TEXT NOT NULL DEFAULT '{}';
ALTER TABLE store_settings ADD COLUMN english_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_settings ADD COLUMN hebrew_enabled INTEGER NOT NULL DEFAULT 0;
