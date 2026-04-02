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

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created_at
  ON credit_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_reference
  ON credit_ledger (reference_type, reference_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_billing_orders_user_created_at
  ON billing_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_orders_provider_order_id
  ON billing_orders (provider_order_id);
