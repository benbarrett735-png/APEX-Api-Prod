-- Create o1_research_runs table for o1-style research mode
-- Phase 1: Core table structure
-- Note: Separate from legacy research_runs table

CREATE TABLE IF NOT EXISTS o1_research_runs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    depth VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    uploaded_files JSONB DEFAULT '[]'::jsonb,
    include_charts JSONB DEFAULT '[]'::jsonb,
    target_sources JSONB DEFAULT '[]'::jsonb,
    report_content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_o1_research_runs_user_id ON o1_research_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_o1_research_runs_status ON o1_research_runs(status);
CREATE INDEX IF NOT EXISTS idx_o1_research_runs_created_at ON o1_research_runs(created_at DESC);

-- Optional: Store thinking activities for replay/debugging
-- (Will be used in later phases for showing thinking chain)
CREATE TABLE IF NOT EXISTS o1_research_activities (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(255) NOT NULL REFERENCES o1_research_runs(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    activity_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_o1_research_activities_run_id ON o1_research_activities(run_id);
CREATE INDEX IF NOT EXISTS idx_o1_research_activities_created_at ON o1_research_activities(created_at);

-- Add comment for documentation
COMMENT ON TABLE o1_research_runs IS 'o1-style research runs with continuous reasoning (ChatGPT o1-like)';
COMMENT ON TABLE o1_research_activities IS 'Thinking chain and tool activities for o1 research runs';

