import test from "node:test";
import assert from "node:assert/strict";
import { getModelCostRatesFromConfig } from "../../ai_pipeline/generator/provider-costs.js";

test("model-specific cost table takes precedence over provider default", () => {
  const rates = getModelCostRatesFromConfig({
    provider: "gemini",
    model: "gemini-2.5-flash",
    config: {
      geminiModelCostsJson: JSON.stringify({
        "gemini-2.5-flash": { inputPer1kUsd: 0.0015, outputPer1kUsd: 0.0025 }
      }),
      geminiInputCostPer1kUsd: 0.01,
      geminiOutputCostPer1kUsd: 0.02
    }
  });

  assert.equal(rates.inputPer1kUsd, 0.0015);
  assert.equal(rates.outputPer1kUsd, 0.0025);
  assert.equal(rates.source, "model-table");
});

test("provider defaults are used when model is not in the cost table", () => {
  const rates = getModelCostRatesFromConfig({
    provider: "ollama",
    model: "phi3:mini",
    config: {
      ollamaModelCostsJson: JSON.stringify({
        "qwen2.5:3b": { inputPer1kUsd: 0.0002, outputPer1kUsd: 0.0003 }
      }),
      ollamaInputCostPer1kUsd: 0.00005,
      ollamaOutputCostPer1kUsd: 0.00007
    }
  });

  assert.equal(rates.inputPer1kUsd, 0.00005);
  assert.equal(rates.outputPer1kUsd, 0.00007);
  assert.equal(rates.source, "provider-default");
});

test("prefix model entries can match model variants", () => {
  const rates = getModelCostRatesFromConfig({
    provider: "gemini",
    model: "gemini-2.5-flash-preview-04-17",
    config: {
      geminiModelCostsJson: JSON.stringify({
        "gemini-2.5-flash": { inputPer1kUsd: 0.001, outputPer1kUsd: 0.002 }
      }),
      geminiInputCostPer1kUsd: 0.01,
      geminiOutputCostPer1kUsd: 0.02
    }
  });

  assert.equal(rates.inputPer1kUsd, 0.001);
  assert.equal(rates.outputPer1kUsd, 0.002);
  assert.equal(rates.source, "model-table");
});
