CREATE TABLE IF NOT EXISTS marketing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  local_day TEXT NOT NULL,
  local_hour INTEGER NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  visitor_hash TEXT NOT NULL,
  product_id INTEGER,
  order_number TEXT,
  category TEXT,
  route TEXT,
  referrer_host TEXT,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  search_term TEXT,
  value_agorot INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_marketing_events_time ON marketing_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_day ON marketing_events(local_day,event_name);
CREATE INDEX IF NOT EXISTS idx_marketing_events_visitor ON marketing_events(visitor_hash,occurred_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_product ON marketing_events(product_id,event_name,occurred_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_campaign ON marketing_events(source,medium,campaign,occurred_at);
