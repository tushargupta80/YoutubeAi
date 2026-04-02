CREATE INDEX IF NOT EXISTS idx_note_jobs_user_created_at
ON note_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_jobs_user_status_created_at
ON note_jobs (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_jobs_video_created_at
ON note_jobs (video_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_logs_user_created_at
ON question_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_created_at
ON users (created_at DESC);
