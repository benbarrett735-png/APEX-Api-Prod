-- Create chat_history table to persist normal chat conversations
CREATE TABLE IF NOT EXISTS chat_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL, -- UUID for each chat session
  message_role TEXT NOT NULL CHECK (message_role IN ('user', 'assistant', 'system')),
  message_content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by user and session
CREATE INDEX idx_chat_history_session ON chat_history(session_id, created_at);
CREATE INDEX idx_chat_history_user ON chat_history(user_id, created_at DESC);

-- chat_sessions table to track active conversations
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT, -- Auto-generated from first message
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);

