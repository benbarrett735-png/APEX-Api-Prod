CREATE TABLE IF NOT EXISTS usage_counters (
  org_id UUID NOT NULL,
  day DATE NOT NULL,
  tokens_in BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, day)
);
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_usage_counters ON usage_counters
USING (org_id::text = current_setting('app.org_id', true));


