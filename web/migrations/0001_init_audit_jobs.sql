CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  python_job_id TEXT UNIQUE,
  provider_job_id TEXT,
  object_key TEXT,
  runtime TEXT NOT NULL DEFAULT 'local-python',
  filename TEXT NOT NULL,
  cutoff TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  pages_ocr INTEGER NOT NULL DEFAULT 0,
  ocr_error_pages INTEGER NOT NULL DEFAULT 0,
  ocr_total_pages INTEGER NOT NULL DEFAULT 0,
  certificate_pages INTEGER NOT NULL DEFAULT 0,
  validity_candidates INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  near_expiry INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_python_job_id ON jobs(python_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_provider_job_id ON jobs(provider_job_id);
