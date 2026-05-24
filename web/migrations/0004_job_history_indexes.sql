CREATE INDEX IF NOT EXISTS idx_jobs_user_created_id ON jobs(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_created_id ON jobs(created_at DESC, id DESC);
