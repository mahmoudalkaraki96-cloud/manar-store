CREATE TABLE IF NOT EXISTS ui_texts (
  text_key TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (text_key, language)
);
