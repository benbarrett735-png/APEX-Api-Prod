CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS migrations(id text primary key, applied_at timestamptz default now());

CREATE TABLE IF NOT EXISTS orgs (
  id uuid primary key,
  name text not null,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid primary key,
  org_id uuid not null,
  email text not null,
  role text not null check (role in ('admin','member')),
  timezone text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS org_subscriptions (
  org_id uuid primary key,
  status text not null check (status in ('trial','active','past_due','canceled')),
  trial_end timestamptz,
  seat_count int not null default 1,
  plan_code text,
  currency text,
  updated_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid primary key,
  org_id uuid not null,
  user_id uuid not null,
  blob_path text not null,
  mime text not null,
  size bigint,
  status text not null default 'received',
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid primary key,
  org_id uuid not null,
  kind text not null check (kind in ('report','plan','research','sim_day')),
  title text,
  status text not null check (status in ('draft','final','deleted')) default 'draft',
  spec_json jsonb,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id uuid primary key,
  org_id uuid not null,
  user_id uuid not null,
  model text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_documents_org_kind_status_created ON documents(org_id, kind, status, created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_org_created ON uploads(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_org_created ON usage_logs(org_id, created_at);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_documents ON documents USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY org_isolation_uploads ON uploads USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY org_isolation_usage ON usage_logs USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY org_isolation_subs ON org_subscriptions USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY org_isolation_users ON users USING (org_id::text = current_setting('app.org_id', true));

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_documents_updated ON documents;
CREATE TRIGGER t_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


