-- Agentic Flow Schema
-- Implements plan-act-observe loop with structured outputs

-- Runs are user-visible tasks (one "agentic flow")
CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  goal TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PLANNING', 'EXECUTING', 'WAITING_TOOL', 'VERIFYING', 'DONE', 'ERROR')),
  plan JSONB,  -- Structured plan output
  final_output TEXT,
  error_message TEXT,
  token_budget INTEGER DEFAULT 100000,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

-- Each step in the plan
CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,  -- Order in the plan
  step_id TEXT NOT NULL,  -- ID from plan JSON
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'ERROR', 'SKIPPED')),
  depends_on TEXT[],  -- Array of step_ids this depends on
  est_tokens INTEGER,
  actual_tokens INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  result_summary TEXT,  -- Short, display-safe summary
  UNIQUE(run_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);
CREATE INDEX IF NOT EXISTS idx_steps_status ON steps(status);

-- Tool calls & results
CREATE TABLE IF NOT EXISTS tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,  -- OpenAI's tool_call_id
  tool_name TEXT NOT NULL,
  args JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  result_summary TEXT,  -- Short, display-safe
  result_payload JSONB,  -- Full raw output if needed (PII-aware)
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id ON tool_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_step_id ON tool_calls(step_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_started_at ON tool_calls(started_at DESC);

-- Streaming console (events you can show in UI)
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  t TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,  -- response.delta, tool.started, tool.completed, plan.updated, error, step.started, step.completed
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_t ON events(t DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- Helper function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for runs table
DROP TRIGGER IF EXISTS update_runs_updated_at ON runs;
CREATE TRIGGER update_runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

