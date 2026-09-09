INSERT OR IGNORE INTO store_settings (
  id,
  store_name,
  watermark_opacity,
  primary_color,
  secondary_color,
  background_color,
  currency,
  whatsapp_enabled,
  facebook_enabled,
  instagram_enabled,
  tiktok_enabled,
  slider_enabled,
  slider_interval_ms,
  show_out_of_stock,
  show_offers,
  show_most_ordered,
  show_top_rated,
  show_newest,
  show_featured,
  home_products_limit,
  show_subcategory_products_in_parent,
  popup_enabled,
  created_at,
  updated_at
) VALUES (
  1,
  'Rokon Home',
  25,
  '#596B45',
  '#7F9067',
  '#F6F4EC',
  'ILS',
  1,
  1,
  1,
  1,
  1,
  5000,
  1,
  1,
  0,
  0,
  1,
  1,
  6,
  1,
  0,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

CREATE TABLE IF NOT EXISTS store_maintenance (
  key TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

UPDATE products
SET stock_quantity = 100
WHERE NOT EXISTS (
  SELECT 1 FROM store_maintenance WHERE key = 'rokon_stock_reset_100_20260910'
);

UPDATE product_variants
SET stock_quantity = 100
WHERE NOT EXISTS (
  SELECT 1 FROM store_maintenance WHERE key = 'rokon_stock_reset_100_20260910'
);

INSERT OR IGNORE INTO store_maintenance (key, applied_at)
VALUES ('rokon_stock_reset_100_20260910', CAST(strftime('%s','now') AS INTEGER) * 1000);
