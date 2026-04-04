import { env } from "../config/env.js";
import { getProviderMetricsSnapshot } from "../services/provider-metrics.service.js";
import { getMetricsSnapshot, renderPrometheusMetrics } from "../services/metrics.service.js";
import { getQueueObservabilitySnapshot } from "../services/queue.js";
import {
  getDailyProviderUsage,
  getProviderLatencySummary,
  getProviderUsageSummary,
  getProviderUsageTotals,
  listRecentProviderEvents
} from "../services/provider-events.repository.js";
import { listCircuitStates } from "../services/provider-circuit.repository.js";
import { pingGemini } from "../../ai_pipeline/generator/provider.gemini.js";
import { pingOllama } from "../../ai_pipeline/generator/provider.ollama.js";

export function buildRuntimeSettings() {
  return {
    primaryProvider: env.geminiApiKey ? "gemini" : "ollama",
    geminiConfigured: Boolean(env.geminiApiKey),
    geminiModel: env.geminiModel,
    geminiTimeoutMs: env.geminiTimeoutMs,
    geminiMaxRetries: env.geminiMaxRetries,
    ollamaBaseUrl: env.ollamaBaseUrl,
    ollamaChatModel: env.ollamaChatModel,
    ollamaPreprocessModel: env.ollamaPreprocessModel,
    ollamaFallbackModel: env.ollamaFallbackModel,
    ollamaEmbedModel: env.ollamaEmbedModel,
    ollamaTimeoutMs: env.ollamaTimeoutMs,
    ollamaMaxRetries: env.ollamaMaxRetries,
    providerRequestLogEnabled: env.providerRequestLogEnabled,
    providerCircuitBreakerEnabled: env.providerCircuitBreakerEnabled,
    providerCircuitBreakerFailureThreshold: env.providerCircuitBreakerFailureThreshold,
    providerCircuitBreakerCooldownMs: env.providerCircuitBreakerCooldownMs,
    geminiModelCostsConfigured: Boolean(env.geminiModelCostsJson),
    ollamaModelCostsConfigured: Boolean(env.ollamaModelCostsJson),
    serviceName: env.serviceName,
    observabilityMetricsWindowSize: env.observabilityMetricsWindowSize
  };
}

export async function getRuntimeSettings(_req, res) {
  return res.json({ ai: buildRuntimeSettings() });
}

export async function getObservabilitySnapshot(_req, res, next) {
  try {
    const [queues, providerLatency] = await Promise.all([
      getQueueObservabilitySnapshot(),
      getProviderLatencySummary(7)
    ]);

    return res.json({
      observability: {
        ...getMetricsSnapshot(),
        queues,
        providerLatency
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPrometheusMetrics(_req, res, next) {
  try {
    const [queues, providerLatency] = await Promise.all([
      getQueueObservabilitySnapshot(),
      getProviderLatencySummary(7)
    ]);
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return res.send(renderPrometheusMetrics({ queues, providerLatency }));
  } catch (error) {
    return next(error);
  }
}

export async function runDiagnostics(_req, res, next) {
  try {
    const [
      metrics,
      recentProviderEvents,
      usageSummaryByProvider,
      dailyUsageSummary,
      usageTotals,
      circuitStates,
      queueObservability,
      providerLatencySummary
    ] = await Promise.all([
      Promise.resolve(getProviderMetricsSnapshot()),
      listRecentProviderEvents(20),
      getProviderUsageSummary(7),
      getDailyProviderUsage(7),
      getProviderUsageTotals(7),
      listCircuitStates(20),
      getQueueObservabilitySnapshot(),
      getProviderLatencySummary(7)
    ]);

    const diagnostics = {
      ollama: {
        ok: false,
        models: [],
        message: ""
      },
      gemini: {
        ok: false,
        model: env.geminiModel,
        message: env.geminiApiKey ? "Configured" : "Not configured"
      },
      metrics,
      recentProviderEvents,
      usageSummaryByProvider,
      dailyUsageSummary,
      usageTotals,
      circuitStates,
      providerLatencySummary,
      observability: getMetricsSnapshot(),
      queues: queueObservability
    };

    try {
      const ollama = await pingOllama();
      diagnostics.ollama.ok = ollama.ok;
      diagnostics.ollama.models = ollama.models || [];
      diagnostics.ollama.message = ollama.message;
    } catch (error) {
      diagnostics.ollama.message = error.message;
    }

    if (env.geminiApiKey) {
      try {
        const gemini = await pingGemini();
        diagnostics.gemini.ok = gemini.ok;
        diagnostics.gemini.message = gemini.message;
      } catch (error) {
        diagnostics.gemini.message = error.message;
      }
    }

    return res.json({ diagnostics });
  } catch (error) {
    return next(error);
  }
}
