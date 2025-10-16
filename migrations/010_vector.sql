-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- RAG corpora (per org)
CREATE TABLE IF NOT EXISTS rag_corpora (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE rag_corpora ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rag_corpora_rls ON rag_corpora;
CREATE POLICY rag_corpora_rls ON rag_corpora
  USING (org_id::text = current_setting('app.org_id', true));

-- RAG chunks
CREATE TABLE IF NOT EXISTS rag_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  corpus_id uuid REFERENCES rag_corpora(id) ON DELETE CASCADE,
  part int NOT NULL,
  text text NOT NULL,
  embedding vector(384),
  meta jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_chunks_doc_idx ON rag_chunks (org_id, document_id);
-- CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx ON rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rag_chunks_rls ON rag_chunks;
CREATE POLICY rag_chunks_rls ON rag_chunks
  USING (org_id::text = current_setting('app.org_id', true));

