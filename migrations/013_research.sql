-- Research Module Tables
-- IMPORTANT: This module is for EXTERNAL RESEARCH ONLY
-- Never store internal/company documents or PII here
-- All data in these tables comes from public external sources

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS research_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null,
  user_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text not null check (status in ('queued','discovering','ingesting','synthesizing','complete','error')) default 'queued',
  mode text not null check (mode in ('market','competitive','technical','regulatory','vendor','policy','financial','ops','custom')),
  queries jsonb not null default '[]'::jsonb,
  must_answer jsonb default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  coverage jsonb default '{}'::jsonb,
  result_id uuid,
  error_message text,
  tokens_used int default 0,
  cost_usd numeric(10,4) default 0,
  FOREIGN KEY (org_id) REFERENCES orgs(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS research_sources (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null,
  url text not null,
  domain text not null,
  title text,
  authors text,
  published_at timestamptz,
  fetched_at timestamptz default now(),
  language text,
  country text,
  content_type text check (content_type in ('filing','patent','standard','news','paper','forum','vendor','blog','other')),
  reliability int check (reliability between 1 and 5) default 3,
  checksum text not null,
  raw_content text,
  normalized_content text,
  metadata jsonb default '{}'::jsonb,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE,
  UNIQUE(run_id, checksum)
);

CREATE TABLE IF NOT EXISTS research_chunks (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid not null,
  text text not null,
  tokens int not null,
  embedding vector(3072), -- text-embedding-3-large dimension
  start_offset int not null,
  end_offset int not null,
  chunk_index int not null,
  metadata jsonb default '{}'::jsonb,
  FOREIGN KEY (source_id) REFERENCES research_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_reports (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null,
  created_at timestamptz default now(),
  summary text,
  narrative text,
  evidence jsonb not null default '[]'::jsonb, -- ClaimEvidence[]
  matrices jsonb default '[]'::jsonb,
  contradictions jsonb default '[]'::jsonb,
  followups jsonb default '[]'::jsonb,
  exports jsonb default '{}'::jsonb,
  FOREIGN KEY (run_id) REFERENCES research_runs(id) ON DELETE CASCADE,
  UNIQUE(run_id)
);

-- Indexes for performance
CREATE INDEX idx_research_runs_org_status ON research_runs(org_id, status, created_at DESC);
CREATE INDEX idx_research_runs_user ON research_runs(user_id, created_at DESC);
CREATE INDEX idx_research_sources_run ON research_sources(run_id);
CREATE INDEX idx_research_sources_domain ON research_sources(domain);
CREATE INDEX idx_research_sources_published ON research_sources(published_at DESC NULLS LAST);
CREATE INDEX idx_research_chunks_source ON research_chunks(source_id);
-- CREATE INDEX idx_research_chunks_embedding ON research_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_research_reports_run ON research_reports(run_id);

-- RLS Policies
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_research_runs ON research_runs USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY org_isolation_research_sources ON research_sources USING (
  EXISTS (SELECT 1 FROM research_runs WHERE research_runs.id = research_sources.run_id AND research_runs.org_id::text = current_setting('app.org_id', true))
);
CREATE POLICY org_isolation_research_chunks ON research_chunks USING (
  EXISTS (
    SELECT 1 FROM research_sources 
    JOIN research_runs ON research_sources.run_id = research_runs.id 
    WHERE research_sources.id = research_chunks.source_id 
    AND research_runs.org_id::text = current_setting('app.org_id', true)
  )
);
CREATE POLICY org_isolation_research_reports ON research_reports USING (
  EXISTS (SELECT 1 FROM research_runs WHERE research_runs.id = research_reports.run_id AND research_runs.org_id::text = current_setting('app.org_id', true))
);

-- Triggers
CREATE TRIGGER t_research_runs_updated BEFORE UPDATE ON research_runs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Helper function for hybrid search scoring
CREATE OR REPLACE FUNCTION research_hybrid_search(
  query_embedding vector(3072),
  query_text text,
  run_uuid uuid,
  top_k int DEFAULT 10,
  alpha numeric DEFAULT 0.6
) RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  text text,
  score numeric,
  url text,
  title text,
  published_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT 
      c.id,
      c.source_id,
      c.text,
      1 - (c.embedding <=> query_embedding) as vec_score
    FROM research_chunks c
    JOIN research_sources s ON c.source_id = s.id
    WHERE s.run_id = run_uuid
    ORDER BY c.embedding <=> query_embedding
    LIMIT top_k * 2
  ),
  text_results AS (
    SELECT 
      c.id,
      c.source_id,
      c.text,
      ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', query_text)) as text_score
    FROM research_chunks c
    JOIN research_sources s ON c.source_id = s.id
    WHERE s.run_id = run_uuid
    AND to_tsvector('english', c.text) @@ plainto_tsquery('english', query_text)
    ORDER BY text_score DESC
    LIMIT top_k * 2
  ),
  combined AS (
    SELECT DISTINCT ON (vr.id)
      vr.id,
      vr.source_id,
      vr.text,
      (alpha * COALESCE(vr.vec_score, 0) + (1 - alpha) * COALESCE(tr.text_score, 0)) as final_score
    FROM vector_results vr
    FULL OUTER JOIN text_results tr ON vr.id = tr.id
  )
  SELECT 
    c.id,
    c.source_id,
    c.text,
    c.final_score,
    s.url,
    s.title,
    s.published_at
  FROM combined c
  JOIN research_sources s ON c.source_id = s.id
  ORDER BY c.final_score DESC
  LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

