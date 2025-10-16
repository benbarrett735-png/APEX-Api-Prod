-- enable uuid/ossp if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content_json jsonb NOT NULL,
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_threads_org ON chat_threads;
CREATE POLICY chat_threads_org ON chat_threads
  USING (org_id::text = current_setting('app.org_id', true));

DROP POLICY IF EXISTS chat_messages_org ON chat_messages;
CREATE POLICY chat_messages_org ON chat_messages
  USING (org_id::text = current_setting('app.org_id', true));

CREATE INDEX IF NOT EXISTS chat_threads_org_updated_idx ON chat_threads(org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages(thread_id, created_at);


