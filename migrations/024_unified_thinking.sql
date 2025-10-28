-- Migrate to unified thinking system
-- All modes (research, templates, reports, charts, plans) use ONE thinking engine

-- Add org_id to existing table
ALTER TABLE o1_research_runs ADD COLUMN IF NOT EXISTS org_id VARCHAR(255);

-- Rename to reflect unified purpose
ALTER TABLE o1_research_runs RENAME TO thinking_runs;
ALTER TABLE o1_research_activities RENAME TO thinking_activities;

-- Update foreign key constraint
ALTER TABLE thinking_activities DROP CONSTRAINT IF EXISTS o1_research_activities_run_id_fkey;
ALTER TABLE thinking_activities ADD CONSTRAINT thinking_activities_run_id_fkey 
    FOREIGN KEY (run_id) REFERENCES thinking_runs(id) ON DELETE CASCADE;

-- Update indexes
DROP INDEX IF EXISTS idx_o1_research_runs_user_id;
DROP INDEX IF EXISTS idx_o1_research_runs_status;
DROP INDEX IF EXISTS idx_o1_research_runs_created_at;
DROP INDEX IF EXISTS idx_o1_research_activities_run_id;
DROP INDEX IF EXISTS idx_o1_research_activities_created_at;

CREATE INDEX IF NOT EXISTS idx_thinking_runs_user_id ON thinking_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_thinking_runs_org_id ON thinking_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_thinking_runs_status ON thinking_runs(status);
CREATE INDEX IF NOT EXISTS idx_thinking_runs_created_at ON thinking_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thinking_activities_run_id ON thinking_activities(run_id);
CREATE INDEX IF NOT EXISTS idx_thinking_activities_created_at ON thinking_activities(created_at);

-- Update comments
COMMENT ON TABLE thinking_runs IS 'Unified thinking engine runs for all agent modes (research, templates, reports, charts, plans)';
COMMENT ON TABLE thinking_activities IS 'Thinking chain and tool activities for thinking runs';

