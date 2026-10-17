CREATE TABLE IF NOT EXISTS pwa_installations (
  installation_id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK(surface IN ('storefront','admin')),
  source TEXT NOT NULL CHECK(source IN ('appinstalled','standalone')),
  installed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pwa_installations_surface ON pwa_installations(surface);
