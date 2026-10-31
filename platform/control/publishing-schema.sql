PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS platform_releases (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 manifest_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_release_batches (
 id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES platform_releases(id),
 selector TEXT NOT NULL, actor TEXT NOT NULL, plan_hash TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE, manifest_snapshot_json TEXT NOT NULL, force_redeploy INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'queued', build_id TEXT, error_code TEXT,
 lease_token TEXT, lease_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_release_targets (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES platform_release_batches(id),
 store_id TEXT NOT NULL REFERENCES platform_stores(id), track TEXT NOT NULL,
 version TEXT NOT NULL, revision TEXT NOT NULL, snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'queued', error_code TEXT,
 previous_versions_json TEXT, worker_version_id TEXT, verified_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_one_active_release_per_store
 ON platform_release_targets(store_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS platform_release_batch_targets ON platform_release_targets(batch_id);
