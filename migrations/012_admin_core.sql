-- Admin core: workspaces, memberships, invites, agent catalog/subscriptions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  stripe_customer_id text,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Role enum
DO $$ BEGIN
  CREATE TYPE role AS ENUM ('owner','admin','member','billing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users base table may already exist; ensure minimal columns present
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Memberships
CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role NOT NULL DEFAULT 'member',
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz
);

-- Agent catalog (seeded in code)
CREATE TABLE IF NOT EXISTS agent_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  tagline text NOT NULL,
  status text NOT NULL,
  icon text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}'
);

-- Agent subscriptions (per-seat; pricing hidden in UI)
CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  seats int NOT NULL,
  status text NOT NULL DEFAULT 'active',
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_ws ON workspace_memberships(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invites_ws ON invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_subs_ws ON agent_subscriptions(workspace_id);


