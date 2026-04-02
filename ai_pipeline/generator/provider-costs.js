import { env } from "../../backend/config/env.js";

function parseCostTable(rawValue) {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([model, value]) => {
        if (value && typeof value === "object") {
          return [model, {
            inputPer1kUsd: Number(value.inputPer1kUsd || 0),
            outputPer1kUsd: Number(value.outputPer1kUsd || 0)
          }];
        }

        return [model, {
          inputPer1kUsd: 0,
          outputPer1kUsd: 0
        }];
      })
    );
  } catch {
    return {};
  }
}

function findModelRate(table, model) {
  if (!model) return null;
  if (table[model]) return table[model];

  const match = Object.entries(table).find(([key]) => model.startsWith(key));
  return match?.[1] || null;
}

export function getModelCostRatesFromConfig({ provider, model, config }) {
  if (provider === "gemini") {
    const table = parseCostTable(config.geminiModelCostsJson);
    const matched = findModelRate(table, model);
    return {
      inputPer1kUsd: Number(matched?.inputPer1kUsd ?? config.geminiInputCostPer1kUsd ?? 0),
      outputPer1kUsd: Number(matched?.outputPer1kUsd ?? config.geminiOutputCostPer1kUsd ?? 0),
      source: matched ? "model-table" : "provider-default"
    };
  }

  if (provider === "ollama") {
    const table = parseCostTable(config.ollamaModelCostsJson);
    const matched = findModelRate(table, model);
    return {
      inputPer1kUsd: Number(matched?.inputPer1kUsd ?? config.ollamaInputCostPer1kUsd ?? 0),
      outputPer1kUsd: Number(matched?.outputPer1kUsd ?? config.ollamaOutputCostPer1kUsd ?? 0),
      source: matched ? "model-table" : "provider-default"
    };
  }

  return {
    inputPer1kUsd: 0,
    outputPer1kUsd: 0,
    source: "unknown"
  };
}

export function getModelCostRates(provider, model) {
  return getModelCostRatesFromConfig({ provider, model, config: env });
}

export function estimateUsageCost(provider, model, inputTokens = 0, outputTokens = 0) {
  const rates = getModelCostRates(provider, model);
  const estimatedCostUsd = Number((((Number(inputTokens || 0) / 1000) * rates.inputPer1kUsd) + ((Number(outputTokens || 0) / 1000) * rates.outputPer1kUsd)).toFixed(6));

  return {
    inputTokens: Number(inputTokens || 0),
    outputTokens: Number(outputTokens || 0),
    estimatedCostUsd,
    costSource: rates.source
  };
}
