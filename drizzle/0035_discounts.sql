CREATE TABLE IF NOT EXISTS discount_rules (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  code TEXT UNIQUE,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS discount_redemptions (
  order_number INTEGER PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES discount_rules(id),
  discount_agorot INTEGER NOT NULL,
  order_total_agorot INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS discount_redemptions_rule ON discount_redemptions(rule_id);
CREATE TRIGGER IF NOT EXISTS discount_redemption_limit BEFORE INSERT ON discount_redemptions
BEGIN
  SELECT RAISE(ABORT, 'discount_unavailable')
  WHERE NOT EXISTS (
    SELECT 1 FROM discount_rules r WHERE r.id = NEW.rule_id AND r.enabled = 1
    AND (json_extract(r.config, '$.startsAt') IS NULL OR json_extract(r.config, '$.startsAt') <= CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
    AND (json_extract(r.config, '$.endsAt') IS NULL OR json_extract(r.config, '$.endsAt') > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
    AND (json_extract(r.config, '$.limit') IS NULL OR
      (SELECT COUNT(*) FROM discount_redemptions d WHERE d.rule_id = r.id) < json_extract(r.config, '$.limit'))
  );
END;
