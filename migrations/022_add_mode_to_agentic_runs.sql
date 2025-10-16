-- Migration 022: Add mode field to agentic_runs table
-- Adds mode field to support different flow types (reports, charts, plans)

ALTER TABLE agentic_runs ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'reports' CHECK (mode IN ('reports', 'charts', 'plans'));

-- Update existing runs to have default mode
UPDATE agentic_runs SET mode = 'reports' WHERE mode IS NULL;

-- Create index for mode field
CREATE INDEX IF NOT EXISTS idx_agentic_runs_mode ON agentic_runs(mode);
