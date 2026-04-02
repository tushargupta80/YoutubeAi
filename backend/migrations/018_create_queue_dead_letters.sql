CREATE TABLE IF NOT EXISTS queue_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  bull_job_id TEXT NOT NULL,
  job_name TEXT,
  notes_job_id TEXT,
  attempts_made INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  payload JSONB,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_failed_at ON queue_dead_letters (failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_queue_failed_at ON queue_dead_letters (queue_name, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_notes_job_failed_at ON queue_dead_letters (notes_job_id, failed_at DESC);
