-- Migration 026: Add metadata and mode fields to chat_threads for Portal thread compatibility
-- This allows storing agent mode, selected charts/research/templates/plans in thread metadata

-- Convert user_id to TEXT to support Cognito UUID strings (not just PostgreSQL UUIDs)
ALTER TABLE chat_threads 
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT,
ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'agent' CHECK (mode IN ('normal', 'agent')),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Update chat_messages to support Portal message structure
-- Note: chat_messages already has org_id, but we add user_id for direct user lookups
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS user_id TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Backfill user_id in messages from thread (one-time migration)
UPDATE chat_messages cm
SET user_id = ct.user_id::TEXT
FROM chat_threads ct
WHERE cm.thread_id = ct.id AND cm.user_id IS NULL;

-- Make user_id NOT NULL after backfill (or allow NULL for legacy messages)
ALTER TABLE chat_messages
ALTER COLUMN user_id SET DEFAULT NULL;

-- Index for faster lookups by user and mode
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_mode ON chat_threads(user_id, mode, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id) WHERE user_id IS NOT NULL;

-- Update the content_json field comment for clarity
COMMENT ON COLUMN chat_threads.metadata IS 'Stores Portal thread metadata: agentMode, selectedCharts, selectedResearch, selectedTemplates, selectedPlans';
COMMENT ON COLUMN chat_messages.metadata IS 'Stores Portal message metadata: runId, mode, isRegenerate, files, researchState';

