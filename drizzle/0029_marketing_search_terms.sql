CREATE TABLE IF NOT EXISTS marketing_search_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  local_day TEXT NOT NULL,
  local_hour INTEGER NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6)
);
CREATE INDEX IF NOT EXISTS idx_marketing_search_terms_time ON marketing_search_terms(occurred_at);
CREATE INDEX IF NOT EXISTS idx_marketing_search_terms_term_time ON marketing_search_terms(term,occurred_at);
