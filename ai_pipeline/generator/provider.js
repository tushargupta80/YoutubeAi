import { env } from "../../backend/config/env.js";
import { upsertCircuitState, getCircuitState } from "../../backend/services/provider-circuit.repository.js";
import { recordProviderRequest } from "../../backend/services/provider-metrics.service.js";
import { logInfo } from "../../backend/utils/logger.js";

export class ProviderRequestError extends Error {
  constructor(message, { provider, operation, statusCode = null, retryable = true, details = {} } = {}) {
    super(message);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.operation = operation;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
  }
}

let circuitStateAdapter = {
  getCircuitState,
  upsertCircuitState
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCircuitBreakerEnabled() {
  return env.providerCircuitBreakerEnabled;
}

async function loadCircuitBucket(provider, operation, model = null) {
  if (!isCircuitBreakerEnabled()) {
    return null;
  }

  const state = await circuitStateAdapter.getCircuitState(provider, operation, model);
  return state || {
    provider,
    operation,
    model,
    consecutive_failures: 0,
    state: "closed",
    open_until: null,
    last_error: null
  };
}

async function persistCircuitState({ provider, operation, model = null, consecutiveFailures = 0, state = "closed", openUntil = null, lastError = null }) {
  if (!isCircuitBreakerEnabled()) {
    return null;
  }

  return circuitStateAdapter.upsertCircuitState({
    provider,
    operation,
    model,
    consecutiveFailures,
    state,
    openUntil,
    lastError
  });
}

async function getCircuitOpenState(provider, operation, model = null) {
  const bucket = await loadCircuitBucket(provider, operation, model);
  if (!bucket) return null;

  const openUntil = bucket.open_until ? new Date(bucket.open_until).getTime() : 0;
  if (bucket.state === "open" && openUntil > Date.now()) {
    return {
      ...bucket,
      openUntilIso: new Date(openUntil).toISOString()
    };
  }

  if (bucket.state === "open" && openUntil && openUntil <= Date.now()) {
    await persistCircuitState({
      provider,
      operation,
      model,
      consecutiveFailures: 0,
      state: "closed",
      openUntil: null,
      lastError: null
    });
  }

  return null;
}

async function recordCircuitSuccess(provider, operation, model = null) {
  if (!isCircuitBreakerEnabled()) return;
  await persistCircuitState({
    provider,
    operation,
    model,
    consecutiveFailures: 0,
    state: "closed",
    openUntil: null,
    lastError: null
  });
}

async function recordCircuitFailure(provider, operation, model = null, error = null) {
  if (!isCircuitBreakerEnabled()) return null;

  const bucket = await loadCircuitBucket(provider, operation, model);
  const consecutiveFailures = Number(bucket?.consecutive_failures || 0) + 1;
  const shouldOpen = consecutiveFailures >= env.providerCircuitBreakerFailureThreshold;
  const openUntil = shouldOpen ? new Date(Date.now() + env.providerCircuitBreakerCooldownMs).toISOString() : null;

  return persistCircuitState({
    provider,
    operation,
    model,
    consecutiveFailures,
    state: shouldOpen ? "open" : "closed",
    openUntil,
    lastError: error?.message || null
  });
}

export function isRetryableStatus(statusCode) {
  return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

export function buildProviderError(error, fallbackMessage, meta = {}) {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  if (error?.name === "AbortError") {
    return new ProviderRequestError(fallbackMessage, {
      ...meta,
      retryable: true
    });
  }

  return new ProviderRequestError(error?.message || fallbackMessage, {
    ...meta,
    retryable: true
  });
}

export async function withProviderRetries(task, {
  provider,
  operation,
  model = null,
  maxRetries = 2,
  retryDelayMs = 750,
  shouldRetry = (error) => error?.retryable !== false
} = {}) {
  let lastError = null;
  const circuitOpenState = await getCircuitOpenState(provider, operation, model);

  if (circuitOpenState) {
    const circuitError = new ProviderRequestError(
      `Circuit breaker is open for ${provider}/${operation} until ${circuitOpenState.openUntilIso}`,
      {
        provider,
        operation,
        statusCode: 503,
        retryable: false,
        details: {
          model,
          openUntil: circuitOpenState.openUntilIso,
          consecutiveFailures: circuitOpenState.consecutive_failures
        }
      }
    );

    recordProviderRequest({
      provider,
      operation,
      outcome: "circuit_open",
      latencyMs: 0,
      statusCode: 503,
      error: circuitError.message,
      model
    });

    if (env.providerRequestLogEnabled) {
      logInfo("Provider circuit breaker blocked request", {
        provider,
        operation,
        model,
        openUntil: circuitError.details.openUntil
      });
    }

    throw circuitError;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();

    try {
      const result = await task({ attempt });
      const latencyMs = Date.now() - startedAt;
      await recordCircuitSuccess(provider, operation, model);
      recordProviderRequest({
        provider,
        operation,
        outcome: "success",
        latencyMs,
        model,
        usage: result?.usage || null
      });

      if (env.providerRequestLogEnabled) {
        logInfo("Provider request succeeded", {
          provider,
          operation,
          model,
          attempt,
          latencyMs,
          usage: result?.usage || null
        });
      }

      return result;
    } catch (error) {
      lastError = error;
      const retrying = attempt < maxRetries && shouldRetry(error);
      const latencyMs = Date.now() - startedAt;

      if (!retrying) {
        await recordCircuitFailure(provider, operation, model, error);
      }

      recordProviderRequest({
        provider,
        operation,
        outcome: retrying ? "retrying" : "failure",
        latencyMs,
        statusCode: error?.statusCode || null,
        error: error?.message || String(error),
        retrying,
        model,
        usage: error?.details?.usage || null
      });

      if (env.providerRequestLogEnabled) {
        logInfo("Provider request attempt finished", {
          provider,
          operation,
          model,
          attempt,
          latencyMs,
          retrying,
          statusCode: error?.statusCode || null,
          error: error?.message || String(error)
        });
      }

      if (!retrying) {
        throw error;
      }

      await wait(retryDelayMs * attempt);
    }
  }

  throw lastError || new ProviderRequestError("Provider request failed.", { provider, operation });
}

export function setCircuitStateAdapterForTests(adapter) {
  circuitStateAdapter = {
    ...circuitStateAdapter,
    ...adapter
  };
}

export function resetCircuitStateAdapterForTests() {
  circuitStateAdapter = {
    getCircuitState,
    upsertCircuitState
  };
}
