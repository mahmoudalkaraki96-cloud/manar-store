-- Neutral per-store configuration. Never seed customer/store-specific values here.
CREATE TABLE IF NOT EXISTS store_profile (
  id integer PRIMARY KEY NOT NULL DEFAULT 1,
  settings_json text NOT NULL DEFAULT '{}',
  updated_at integer NOT NULL DEFAULT 0
);
