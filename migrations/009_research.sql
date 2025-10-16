CREATE TABLE IF NOT EXISTS research_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text,
  status text NOT NULL CHECK (status IN ('queued','running','done','error')) DEFAULT 'queued',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_targets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','fetched','error')) DEFAULT 'queued',
  content_text text,
  http_status int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_outputs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  summary_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_research_jobs ON research_jobs
USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY org_isolation_research_targets ON research_targets
USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY org_isolation_research_outputs ON research_outputs
USING (org_id::text = current_setting('app.org_id', true));

CREATE INDEX IF NOT EXISTS idx_research_jobs_org ON research_jobs(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_research_targets_job ON research_targets(org_id, job_id);
CREATE INDEX IF NOT EXISTS idx_research_outputs_job ON research_outputs(org_id, job_id);


