-- Additive schema only. Does not replace Cloudflare Access or create sessions.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
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

