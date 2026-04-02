ALTER TABLE note_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE question_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_note_jobs_user_id ON note_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_question_logs_user_id ON question_logs (user_id);