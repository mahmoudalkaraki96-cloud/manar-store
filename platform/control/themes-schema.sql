
CREATE TABLE IF NOT EXISTS platform_theme_jobs(
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES platform_stores(id),theme_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued',stage TEXT NOT NULL DEFAULT 'queued',snapshot_json TEXT NOT NULL,
 requested_by TEXT NOT NULL,request_key TEXT NOT NULL UNIQUE,error_code TEXT,build_id TEXT,
 expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS platform_one_theme_job_per_store ON platform_theme_jobs(store_id) WHERE status IN ('queued','running');
