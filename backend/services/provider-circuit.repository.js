import { env } from "../config/env.js";
import { query } from "../config/db.js";

function normalizeModel(model) {
  return model || "";
}

export async function getCircuitState(provider, operation, model = null) {
  if (!env.providerCircuitBreakerEnabled) {
    return null;
  }

  const result = await query(
    `SELECT provider, operation, model, consecutive_failures, state, open_until, last_error, updated_at
     FROM ai_provider_circuits
     WHERE provider = $1 AND operation = $2 AND COALESCE(model, '') = $3`,
    [provider, operation, normalizeModel(model)]
  );

  return result.rows[0] || null;
}

export async function upsertCircuitState({
  provider,
  operation,
  model = null,
  consecutiveFailures = 0,
  state = "closed",
  openUntil = null,
  lastError = null
}) {
  if (!env.providerCircuitBreakerEnabled) {
    return null;
  }

  const result = await query(
    `INSERT INTO ai_provider_circuits (
       provider, operation, model, consecutive_failures, state, open_until, last_error, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (provider, operation, model)
     DO UPDATE SET
       consecutive_failures = EXCLUDED.consecutive_failures,
       state = EXCLUDED.state,
       open_until = EXCLUDED.open_until,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()
     RETURNING provider, operation, model, consecutive_failures, state, open_until, last_error, updated_at`,
    [provider, operation, model, consecutiveFailures, state, openUntil, lastError]
  );

  return result.rows[0] || null;
}

export async function listCircuitStates(limit = 25) {
  const safeLimit = Math.min(Math.max(Number(limit || 25), 1), 100);
  const result = await query(
    `SELECT provider, operation, model, consecutive_failures, state, open_until, last_error, updated_at
     FROM ai_provider_circuits
     ORDER BY state DESC, updated_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows;
}
