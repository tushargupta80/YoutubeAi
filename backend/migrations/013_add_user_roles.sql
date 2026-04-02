ALTER TABLE users
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

UPDATE users
SET role = 'user'
WHERE role IS NULL OR role = '';

CREATE INDEX IF NOT EXISTS idx_users_role_created_at
  ON users (role, created_at DESC);
