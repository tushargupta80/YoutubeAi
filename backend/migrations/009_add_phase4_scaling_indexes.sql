CREATE INDEX IF NOT EXISTS idx_note_jobs_created_at
ON note_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_jobs_status_created_at
ON note_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_jobs_user_video_created_at
ON note_jobs (user_id, video_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_jobs_video_completed_created_at
ON note_jobs (video_id, created_at DESC)
WHERE status = 'completed' AND notes_markdown IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vector_chunks_video_start_ms
ON vector_chunks (video_id, start_ms);
