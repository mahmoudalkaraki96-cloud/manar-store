
CREATE TABLE IF NOT EXISTS platform_admin_accounts(
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES platform_stores(id),email TEXT NOT NULL COLLATE NOCASE,
 name TEXT NOT NULL,user_id INTEGER,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 UNIQUE(store_id,email));
CREATE TABLE IF NOT EXISTS platform_account_jobs(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES platform_admin_accounts(id),store_id TEXT NOT NULL,
 operation TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',stage TEXT NOT NULL DEFAULT 'queued',
 password_hash TEXT,password_salt TEXT,snapshot_json TEXT NOT NULL,requested_by TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,error_code TEXT,build_id TEXT,expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS platform_one_account_mutation ON platform_account_jobs(account_id) WHERE status IN ('queued','running');
