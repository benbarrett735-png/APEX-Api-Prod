-- Simple Research Module
-- Drop existing tables if they exist
DROP TABLE IF EXISTS research_reports CASCADE;
DROP TABLE IF EXISTS research_chunks CASCADE;
DROP TABLE IF EXISTS research_sources CASCADE;
DROP TABLE IF EXISTS research_runs CASCADE;

-- Simple research runs table
CREATE TABLE research_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'complete', 'error')),
  research_type TEXT NOT NULL CHECK (research_type IN ('competitive', 'market', 'technical', 'regulatory', 'vendor', 'financial', 'policy', 'ops')),
  question TEXT NOT NULL,
  result_text TEXT,
  error_message TEXT
);

-- Create indexes
CREATE INDEX idx_research_runs_org ON research_runs(org_id);
CREATE INDEX idx_research_runs_user ON research_runs(user_id);
CREATE INDEX idx_research_runs_status ON research_runs(status);

-- Enable RLS
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY research_runs_org_isolation ON research_runs 
  USING (org_id::text = current_setting('app.org_id', true));
