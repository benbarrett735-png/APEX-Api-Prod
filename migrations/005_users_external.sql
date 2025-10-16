ALTER TABLE users ADD COLUMN IF NOT EXISTS external_sub text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('active','invited')) DEFAULT 'active';
CREATE UNIQUE INDEX IF NOT EXISTS users_org_email_unique ON users(org_id, email);


