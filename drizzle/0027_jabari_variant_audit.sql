
CREATE TABLE IF NOT EXISTS jabari_variant_audit (
 source_id INTEGER NOT NULL, mode TEXT NOT NULL, product_id INTEGER NOT NULL,
 status TEXT NOT NULL, detail TEXT NOT NULL, token TEXT NOT NULL,
 updated_at INTEGER NOT NULL, PRIMARY KEY(source_id,mode));
CREATE TABLE IF NOT EXISTS jabari_variant_audit_lock (
 id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,expires_at INTEGER NOT NULL);
INSERT OR IGNORE INTO jabari_variant_audit_lock VALUES(1,'',0);

