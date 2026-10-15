-- Anonymous browser activity; no IP addresses or coordinates are stored.
CREATE TABLE IF NOT EXISTS store_browser_activity (
 cart_id TEXT PRIMARY KEY,
 device_type TEXT NOT NULL,
 browser TEXT NOT NULL,
 country TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '',
 first_seen_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_browser_activity_seen ON store_browser_activity(last_seen_at);
