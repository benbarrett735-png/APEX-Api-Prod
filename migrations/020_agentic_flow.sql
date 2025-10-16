-- Migration 020: Agentic Flow Tables (Manus.im style)
-- Creates tables for the agentic flow orchestrator

-- Agentic runs table
CREATE TABLE IF NOT EXISTS agentic_runs (
    run_id VARCHAR(100) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    completion_criteria JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agentic steps table
CREATE TABLE IF NOT EXISTS agentic_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(100) NOT NULL REFERENCES agentic_runs(run_id) ON DELETE CASCADE,
    step_id VARCHAR(50) NOT NULL, -- step-###
    action_name VARCHAR(100) NOT NULL,
    args_json JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    result_uri TEXT,
    result_summary TEXT,
    error_class VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(run_id, step_id) -- Ensure step_id is unique per run
);

-- Agentic artifacts table
CREATE TABLE IF NOT EXISTS agentic_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(100) NOT NULL REFERENCES agentic_runs(run_id) ON DELETE CASCADE,
    artifact_key VARCHAR(100) NOT NULL, -- step:step-001, etc.
    uri TEXT NOT NULL, -- artifact://...
    type VARCHAR(50) NOT NULL,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(run_id, artifact_key) -- Ensure artifact_key is unique per run
);

-- Agentic events table (append-only)
CREATE TABLE IF NOT EXISTS agentic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(100) NOT NULL REFERENCES agentic_runs(run_id) ON DELETE CASCADE,
    step_id VARCHAR(50),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB DEFAULT '{}',
    ts TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agentic_runs_user_id ON agentic_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agentic_runs_status ON agentic_runs(status);
CREATE INDEX IF NOT EXISTS idx_agentic_runs_started_at ON agentic_runs(started_at);

CREATE INDEX IF NOT EXISTS idx_agentic_steps_run_id ON agentic_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_agentic_steps_step_id ON agentic_steps(step_id);
CREATE INDEX IF NOT EXISTS idx_agentic_steps_status ON agentic_steps(status);
CREATE INDEX IF NOT EXISTS idx_agentic_steps_started_at ON agentic_steps(started_at);

CREATE INDEX IF NOT EXISTS idx_agentic_artifacts_run_id ON agentic_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_agentic_artifacts_key ON agentic_artifacts(artifact_key);
CREATE INDEX IF NOT EXISTS idx_agentic_artifacts_type ON agentic_artifacts(type);

CREATE INDEX IF NOT EXISTS idx_agentic_events_run_id ON agentic_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agentic_events_step_id ON agentic_events(step_id);
CREATE INDEX IF NOT EXISTS idx_agentic_events_type ON agentic_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agentic_events_ts ON agentic_events(ts);

-- Update trigger for agentic_runs
CREATE OR REPLACE FUNCTION update_agentic_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agentic_runs_updated_at
    BEFORE UPDATE ON agentic_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_agentic_runs_updated_at();
