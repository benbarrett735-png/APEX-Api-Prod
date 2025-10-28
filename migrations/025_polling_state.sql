-- Migration 025: Polling State for Agent Runs
-- Purpose: Support start → poll → append pattern to avoid edge timeouts

-- Agent runs state table
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'research' | 'report' | 'template' | 'chart'
  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|done|error|cancelled
  input JSONB NOT NULL, -- original request params
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);

-- Incremental items (for cursor-based polling)
CREATE TABLE IF NOT EXISTS agent_run_items (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, -- monotonic cursor
  type TEXT NOT NULL, -- 'text_delta' | 'partial_replace' | 'status' | 'tool' | 'complete'
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_items_run_id_seq ON agent_run_items(run_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_items_run_seq_unique ON agent_run_items(run_id, seq);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_agent_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_runs_updated_at
  BEFORE UPDATE ON agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_runs_updated_at();

-- Helper function to append items atomically
CREATE OR REPLACE FUNCTION append_agent_items(
  p_run_id TEXT,
  p_items JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_next_seq INTEGER;
  v_item JSONB;
  v_inserted INTEGER := 0;
BEGIN
  -- Get next sequence number
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_next_seq
  FROM agent_run_items
  WHERE run_id = p_run_id;
  
  -- Insert each item with incrementing seq
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO agent_run_items (run_id, seq, type, payload)
    VALUES (
      p_run_id,
      v_next_seq,
      v_item->>'type',
      v_item->'payload'
    );
    
    v_next_seq := v_next_seq + 1;
    v_inserted := v_inserted + 1;
  END LOOP;
  
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE agent_runs IS 'Agent execution runs (research, reports, templates, charts)';
COMMENT ON TABLE agent_run_items IS 'Incremental output items for cursor-based polling';
COMMENT ON FUNCTION append_agent_items IS 'Atomically append items with sequential cursor values';

