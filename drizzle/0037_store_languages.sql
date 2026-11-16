CREATE TABLE IF NOT EXISTS store_languages (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  dir TEXT NOT NULL CHECK (dir IN ('rtl','ltr')),
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_source INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS store_languages_single_default ON store_languages(is_default) WHERE is_default = 1;
CREATE UNIQUE INDEX IF NOT EXISTS store_languages_single_source ON store_languages(is_source) WHERE is_source = 1;
INSERT OR IGNORE INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order) VALUES ('AR','العربية','rtl',1,1,1,0);
INSERT OR IGNORE INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order) VALUES ('EN','English','ltr',COALESCE((SELECT english_enabled FROM store_settings WHERE id=1),0),0,0,1);
INSERT OR IGNORE INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order) VALUES ('HE','עברית','rtl',COALESCE((SELECT hebrew_enabled FROM store_settings WHERE id=1),0),0,0,2);
