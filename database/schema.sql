CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_url TEXT NOT NULL UNIQUE,
  youtube_video_id TEXT NOT NULL,
  title TEXT,
  transcript TEXT,
  transcript_items JSONB,
  cleaned_transcript TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE videos ADD COLUMN IF NOT EXISTS transcript_items JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_session_id UUID REFERENCES user_refresh_sessions(id) ON DELETE SET NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS note_jobs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  error_message TEXT,
  notes_markdown TEXT,
  notes_json JSONB,
  flashcards JSONB,
  quiz JSONB,
  generation_provider TEXT,
  processing_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE note_jobs ADD COLUMN IF NOT EXISTS generation_provider TEXT;
ALTER TABLE note_jobs ADD COLUMN IF NOT EXISTS processing_seconds INTEGER;
ALTER TABLE note_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS question_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE question_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS vector_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  chunk_id TEXT,
  content TEXT NOT NULL,
  start_ms BIGINT,
  end_ms BIGINT,
  embedding JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT,
  outcome TEXT NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  retrying BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_to TEXT,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(12, 6),
  cost_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_provider_circuits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'closed',
  open_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, operation, model)
);

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

CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos (youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_note_jobs_video_id ON note_jobs (video_id);
CREATE INDEX IF NOT EXISTS idx_note_jobs_user_id ON note_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_note_jobs_created_at ON note_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_jobs_status_created_at ON note_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_jobs_user_created_at ON note_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_jobs_user_status_created_at ON note_jobs (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_jobs_user_video_created_at ON note_jobs (user_id, video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_jobs_video_created_at ON note_jobs (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_jobs_video_completed_created_at ON note_jobs (video_id, created_at DESC) WHERE status = 'completed' AND notes_markdown IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_question_logs_video_id ON question_logs (video_id);
CREATE INDEX IF NOT EXISTS idx_question_logs_user_id ON question_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_question_logs_user_created_at ON question_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON users (role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_refresh_sessions_user_created_at ON user_refresh_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_refresh_sessions_expires_at ON user_refresh_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_video_id ON vector_chunks (video_id);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_video_start_ms ON vector_chunks (video_id, start_ms);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'vector_chunks'
         AND column_name = 'embedding_vector'
     ) THEN
    BEGIN
      EXECUTE '
        CREATE INDEX IF NOT EXISTS idx_vector_chunks_embedding_hnsw_cosine
        ON vector_chunks
        USING hnsw (embedding_vector vector_cosine_ops)
        WHERE embedding_vector IS NOT NULL
      ';
    EXCEPTION
      WHEN undefined_object THEN
        NULL;
      WHEN feature_not_supported THEN
        NULL;
      WHEN invalid_parameter_value THEN
        NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_provider_events_created_at ON ai_provider_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_events_provider_operation_created_at ON ai_provider_events (provider, operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_circuits_state_updated_at ON ai_provider_circuits (state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_created_at ON api_request_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_failed_at ON queue_dead_letters (failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_queue_failed_at ON queue_dead_letters (queue_name, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_dead_letters_notes_job_failed_at ON queue_dead_letters (notes_job_id, failed_at DESC);






ALTER TABLE queue_dead_letters
  ADD COLUMN IF NOT EXISTS replay_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_replayed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_credited INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount_inr INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT,
  provider_signature TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created_at ON credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_reference ON credit_ledger (reference_type, reference_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_orders_user_created_at ON billing_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_orders_provider_order_id ON billing_orders (provider_order_id);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_orders ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT
  USING (id = public.current_app_user_id());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());

DROP POLICY IF EXISTS user_refresh_sessions_select_own ON public.user_refresh_sessions;
CREATE POLICY user_refresh_sessions_select_own ON public.user_refresh_sessions
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_refresh_sessions_update_own ON public.user_refresh_sessions;
CREATE POLICY user_refresh_sessions_update_own ON public.user_refresh_sessions
  FOR UPDATE
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_refresh_sessions_delete_own ON public.user_refresh_sessions;
CREATE POLICY user_refresh_sessions_delete_own ON public.user_refresh_sessions
  FOR DELETE
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS note_jobs_select_own ON public.note_jobs;
CREATE POLICY note_jobs_select_own ON public.note_jobs
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS note_jobs_delete_own ON public.note_jobs;
CREATE POLICY note_jobs_delete_own ON public.note_jobs
  FOR DELETE
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS question_logs_select_own ON public.question_logs;
CREATE POLICY question_logs_select_own ON public.question_logs
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_credit_accounts_select_own ON public.user_credit_accounts;
CREATE POLICY user_credit_accounts_select_own ON public.user_credit_accounts
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS credit_ledger_select_own ON public.credit_ledger;
CREATE POLICY credit_ledger_select_own ON public.credit_ledger
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS billing_orders_select_own ON public.billing_orders;
CREATE POLICY billing_orders_select_own ON public.billing_orders
  FOR SELECT
  USING (user_id = public.current_app_user_id());