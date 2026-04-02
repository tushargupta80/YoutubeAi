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

CREATE INDEX IF NOT EXISTS idx_vector_chunks_video_id ON vector_chunks (video_id);