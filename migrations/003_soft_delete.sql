ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(org_id, status, deleted_at);


