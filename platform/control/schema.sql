PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS platform_stores (
 id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', owner_email TEXT,
 custom_domain TEXT, status TEXT NOT NULL DEFAULT 'draft', resources_json TEXT NOT NULL DEFAULT '{}',
 app_version TEXT, app_revision TEXT, management_mode TEXT NOT NULL DEFAULT 'managed',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_store_domain ON platform_stores(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE TABLE IF NOT EXISTS platform_jobs (
 id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES platform_stores(id), operation TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'queued', error_code TEXT,
 requested_by TEXT NOT NULL, lease_token TEXT, lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_one_active_job ON platform_jobs(store_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS platform_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, store_id TEXT,
 details_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
