CREATE TABLE IF NOT EXISTS push_config(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_jwk TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','customer')),origin TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,account_id INTEGER,orders_enabled INTEGER NOT NULL DEFAULT 1,offers_enabled INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_order_links(order_id INTEGER NOT NULL,subscription_id TEXT NOT NULL,PRIMARY KEY(order_id,subscription_id));
CREATE TABLE IF NOT EXISTS push_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,subscription_id TEXT NOT NULL,payload TEXT NOT NULL,dedupe_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,created_at INTEGER NOT NULL,sent_at INTEGER);
CREATE INDEX IF NOT EXISTS push_jobs_pending ON push_jobs(status,next_attempt);
CREATE INDEX IF NOT EXISTS push_subscriptions_account ON push_subscriptions(account_id,role,disabled);
