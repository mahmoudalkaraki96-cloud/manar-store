CREATE TABLE IF NOT EXISTS store_cart_details (
 cart_id TEXT PRIMARY KEY,
 items_json TEXT NOT NULL CHECK(json_valid(items_json))
);
