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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_events_created_at
ON ai_provider_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_events_provider_operation_created_at
ON ai_provider_events (provider, operation, created_at DESC);
