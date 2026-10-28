-- Additive schema only. Does not replace Cloudflare Access or create sessions.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  password_expires_at INTEGER,
  auth_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_group_members (
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES admin_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);
CREATE TABLE IF NOT EXISTS admin_group_permissions (
  group_id INTEGER NOT NULL REFERENCES admin_groups(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (group_id, permission)
);
CREATE TABLE IF NOT EXISTS admin_user_permissions (
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES admin_users(id),
 auth_version INTEGER NOT NULL, method TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS admin_sessions_user ON admin_sessions(user_id);
CREATE TABLE IF NOT EXISTS admin_audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, actor_label TEXT NOT NULL,
 action TEXT NOT NULL, target TEXT NOT NULL, status INTEGER NOT NULL,
 details TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_time ON admin_audit_log(created_at);
CREATE TABLE IF NOT EXISTS admin_login_limits (
 key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_password_resets (
 account_id INTEGER PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_mutation_guards (
 token TEXT PRIMARY KEY,
 valid INTEGER NOT NULL CHECK(valid=1)
);
