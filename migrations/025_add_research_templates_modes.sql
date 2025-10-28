-- Migration 025: Add research and templates to allowed modes
-- Fixes: Portal sends mode="research" and mode="templates" but database rejects them

-- Drop the old constraint
ALTER TABLE agentic_runs DROP CONSTRAINT IF EXISTS agentic_runs_mode_check;

-- Add new constraint with research and templates
ALTER TABLE agentic_runs ADD CONSTRAINT agentic_runs_mode_check 
  CHECK (mode IN ('reports', 'charts', 'plans', 'research', 'templates'));

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_agentic_runs_mode ON agentic_runs(mode);

