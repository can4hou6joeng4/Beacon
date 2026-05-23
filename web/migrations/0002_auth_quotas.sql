CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id TEXT PRIMARY KEY,
  upload_bytes_limit INTEGER NOT NULL DEFAULT 0,
  ocr_jobs_limit INTEGER NOT NULL DEFAULT 0,
  ocr_pages_limit INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'lifetime',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quota_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT,
  resource TEXT NOT NULL CHECK (resource IN ('upload_bytes', 'ocr_jobs', 'ocr_pages')),
  action TEXT NOT NULL CHECK (action IN ('reserve', 'consume', 'refund', 'adjust')),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

ALTER TABLE jobs ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE jobs ADD COLUMN upload_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN ocr_pages_used INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_quota_ledger_user_resource ON quota_ledger(user_id, resource);
CREATE INDEX IF NOT EXISTS idx_quota_ledger_job_id ON quota_ledger(job_id);
