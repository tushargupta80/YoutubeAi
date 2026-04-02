import { query } from "../config/db.js";

function clampLimit(limit, fallback = 25, max = 100) {
  return Math.min(Math.max(Number(limit || fallback), 1), max);
}

function clampDays(days, fallback = 7, max = 90) {
  return Math.min(Math.max(Number(days || fallback), 1), max);
}

export async function insertProviderEvent({
  provider,
  operation,
  model = null,
  outcome,
  statusCode = null,
  latencyMs = null,
  retrying = false,
  fallbackTo = null,
  errorMessage = null,
  inputTokens = null,
  outputTokens = null,
  estimatedCostUsd = null,
  costSource = null
}) {
  await query(
    `INSERT INTO ai_provider_events (
       provider, operation, model, outcome, status_code,
       latency_ms, retrying, fallback_to, error_message,
       input_tokens, output_tokens, estimated_cost_usd, cost_source
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      provider,
      operation,
      model,
      outcome,
      statusCode,
      latencyMs,
      retrying,
      fallbackTo,
      errorMessage,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      costSource
    ]
  );
}

export async function listRecentProviderEvents(limit = 25) {
  const safeLimit = clampLimit(limit);
  const result = await query(
    `SELECT provider, operation, model, outcome, status_code, latency_ms,
            retrying, fallback_to, error_message, input_tokens, output_tokens,
            estimated_cost_usd, cost_source, created_at
     FROM ai_provider_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

export async function getProviderUsageTotals(days = 7) {
  const safeDays = clampDays(days);
  const result = await query(
    `SELECT COUNT(*)::int AS request_count,
            COUNT(*) FILTER (WHERE outcome = 'success')::int AS success_count,
            COUNT(*) FILTER (WHERE outcome = 'failure')::int AS failure_count,
            COUNT(*) FILTER (WHERE outcome = 'fallback')::int AS fallback_count,
            COUNT(*) FILTER (WHERE outcome = 'circuit_open')::int AS circuit_open_count,
            COALESCE(SUM(input_tokens), 0)::bigint AS total_input_tokens,
            COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)::numeric(12, 6) AS total_estimated_cost_usd
     FROM ai_provider_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
    [safeDays]
  );

  return result.rows[0] || {
    request_count: 0,
    success_count: 0,
    failure_count: 0,
    fallback_count: 0,
    circuit_open_count: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_estimated_cost_usd: 0
  };
}

export async function getProviderUsageSummary(days = 7) {
  const safeDays = clampDays(days);
  const result = await query(
    `SELECT provider,
            COUNT(*)::int AS request_count,
            COUNT(*) FILTER (WHERE outcome = 'success')::int AS success_count,
            COUNT(*) FILTER (WHERE outcome = 'failure')::int AS failure_count,
            COUNT(*) FILTER (WHERE outcome = 'fallback')::int AS fallback_count,
            COUNT(*) FILTER (WHERE outcome = 'circuit_open')::int AS circuit_open_count,
            COALESCE(SUM(input_tokens), 0)::bigint AS total_input_tokens,
            COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)::numeric(12, 6) AS total_estimated_cost_usd
     FROM ai_provider_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY provider
     ORDER BY total_estimated_cost_usd DESC, request_count DESC, provider ASC`,
    [safeDays]
  );

  return result.rows;
}

export async function getDailyProviderUsage(days = 7) {
  const safeDays = clampDays(days);
  const result = await query(
    `SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
            provider,
            COUNT(*)::int AS request_count,
            COUNT(*) FILTER (WHERE outcome = 'success')::int AS success_count,
            COUNT(*) FILTER (WHERE outcome = 'failure')::int AS failure_count,
            COUNT(*) FILTER (WHERE outcome = 'fallback')::int AS fallback_count,
            COUNT(*) FILTER (WHERE outcome = 'circuit_open')::int AS circuit_open_count,
            COALESCE(SUM(input_tokens), 0)::bigint AS total_input_tokens,
            COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)::numeric(12, 6) AS total_estimated_cost_usd
     FROM ai_provider_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY DATE_TRUNC('day', created_at), provider
     ORDER BY day DESC, provider ASC`,
    [safeDays]
  );

  return result.rows;
}

export async function getProviderLatencySummary(days = 7) {
  const safeDays = clampDays(days);
  const result = await query(
    `SELECT provider,
            operation,
            COUNT(*)::int AS sample_count,
            ROUND(AVG(latency_ms))::int AS avg_latency_ms,
            MAX(latency_ms)::int AS max_latency_ms,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50_latency_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_latency_ms,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99_latency_ms
     FROM ai_provider_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       AND latency_ms IS NOT NULL
     GROUP BY provider, operation
     ORDER BY p95_latency_ms DESC NULLS LAST, sample_count DESC, provider ASC, operation ASC`,
    [safeDays]
  );
  return result.rows;
}
