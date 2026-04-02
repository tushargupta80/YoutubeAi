import { env } from "../config/env.js";
import { logError, logInfo } from "../utils/logger.js";
import { insertProviderEvent } from "./provider-events.repository.js";

const providerMetrics = new Map();

function getKey(provider, operation) {
  return `${provider}:${operation}`;
}

function getBucket(provider, operation) {
  const key = getKey(provider, operation);
  if (!providerMetrics.has(key)) {
    providerMetrics.set(key, {
      provider,
      operation,
      total: 0,
      success: 0,
      failure: 0,
      retries: 0,
      fallbacks: 0,
      circuitOpen: 0,
      totalLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCostUsd: 0,
      lastStatusCode: null,
      lastError: "",
      updatedAt: null
    });
  }
  return providerMetrics.get(key);
}

function persistProviderEvent(payload) {
  insertProviderEvent(payload).catch((error) => {
    logError("Failed to persist provider event", error, {
      provider: payload.provider,
      operation: payload.operation,
      outcome: payload.outcome
    });
  });
}

export function recordProviderRequest({
  provider,
  operation,
  outcome,
  latencyMs = 0,
  statusCode = null,
  error = "",
  retrying = false,
  model = null,
  usage = null
}) {
  const bucket = getBucket(provider, operation);
  bucket.total += 1;
  bucket.totalLatencyMs += Math.max(0, latencyMs || 0);
  bucket.totalInputTokens += Number(usage?.inputTokens || 0);
  bucket.totalOutputTokens += Number(usage?.outputTokens || 0);
  bucket.totalEstimatedCostUsd += Number(usage?.estimatedCostUsd || 0);
  bucket.lastStatusCode = statusCode;
  bucket.lastError = error || "";
  bucket.updatedAt = new Date().toISOString();

  if (outcome === "success") bucket.success += 1;
  if (outcome === "failure") bucket.failure += 1;
  if (outcome === "retrying") bucket.retries += 1;
  if (outcome === "circuit_open") bucket.circuitOpen += 1;

  persistProviderEvent({
    provider,
    operation,
    model,
    outcome,
    statusCode,
    latencyMs,
    retrying,
    errorMessage: error || null,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    estimatedCostUsd: usage?.estimatedCostUsd ?? null,
    costSource: usage?.costSource ?? null
  });

  if (env.providerRequestLogEnabled) {
    logInfo("Provider telemetry updated", {
      provider,
      operation,
      outcome,
      latencyMs,
      statusCode,
      retrying,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      estimatedCostUsd: usage?.estimatedCostUsd ?? 0,
      costSource: usage?.costSource ?? null,
      total: bucket.total,
      success: bucket.success,
      failure: bucket.failure,
      retries: bucket.retries,
      circuitOpen: bucket.circuitOpen
    });
  }
}

export function recordProviderFallback({ operation, fromProvider, toProvider, reason, model = null }) {
  const bucket = getBucket(fromProvider, operation);
  bucket.fallbacks += 1;
  bucket.lastError = reason || "";
  bucket.updatedAt = new Date().toISOString();

  persistProviderEvent({
    provider: fromProvider,
    operation,
    model,
    outcome: "fallback",
    retrying: false,
    fallbackTo: toProvider,
    errorMessage: reason || null
  });

  if (env.providerRequestLogEnabled) {
    logInfo("Provider fallback triggered", {
      operation,
      fromProvider,
      toProvider,
      reason,
      fallbacks: bucket.fallbacks
    });
  }
}

export function getProviderMetricsSnapshot() {
  return Array.from(providerMetrics.values()).map((bucket) => ({
    ...bucket,
    averageLatencyMs: bucket.total ? Math.round(bucket.totalLatencyMs / bucket.total) : 0,
    averageInputTokens: bucket.total ? Math.round(bucket.totalInputTokens / bucket.total) : 0,
    averageOutputTokens: bucket.total ? Math.round(bucket.totalOutputTokens / bucket.total) : 0,
    averageEstimatedCostUsd: bucket.total ? Number((bucket.totalEstimatedCostUsd / bucket.total).toFixed(6)) : 0,
    successRatePercent: bucket.total ? Math.round((bucket.success / bucket.total) * 100) : 0,
    totalEstimatedCostUsd: Number(bucket.totalEstimatedCostUsd.toFixed(6))
  }));
}
