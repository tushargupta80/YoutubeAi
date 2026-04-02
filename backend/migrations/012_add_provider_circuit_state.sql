ALTER TABLE ai_provider_events
ADD COLUMN IF NOT EXISTS cost_source TEXT;

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

CREATE INDEX IF NOT EXISTS idx_ai_provider_circuits_state_updated_at
  ON ai_provider_circuits (state, updated_at DESC);
