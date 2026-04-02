import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRequestError, resetCircuitStateAdapterForTests, setCircuitStateAdapterForTests, withProviderRetries } from "../../ai_pipeline/generator/provider.js";
import { getProviderPolicy } from "../../ai_pipeline/generator/provider-policy.js";

function createMemoryCircuitAdapter() {
  const store = new Map();
  const keyFor = (provider, operation, model = null) => `${provider}:${operation}:${model || ""}`;

  return {
    async getCircuitState(provider, operation, model = null) {
      return store.get(keyFor(provider, operation, model)) || null;
    },
    async upsertCircuitState({ provider, operation, model = null, consecutiveFailures = 0, state = "closed", openUntil = null, lastError = null }) {
      const value = {
        provider,
        operation,
        model,
        consecutive_failures: consecutiveFailures,
        state,
        open_until: openUntil,
        last_error: lastError,
        updated_at: new Date().toISOString()
      };
      store.set(keyFor(provider, operation, model), value);
      return value;
    },
    snapshot() {
      return store;
    }
  };
}

test.afterEach(() => {
  resetCircuitStateAdapterForTests();
});

test("withProviderRetries retries a transient provider error and then succeeds", async () => {
  const adapter = createMemoryCircuitAdapter();
  setCircuitStateAdapterForTests(adapter);

  let attempts = 0;
  const result = await withProviderRetries(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new ProviderRequestError("temporary failure", {
        provider: "gemini",
        operation: "generate-text",
        retryable: true
      });
    }

    return {
      text: "ok",
      usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0, costSource: "provider-default" }
    };
  }, {
    provider: "gemini",
    operation: "generate-text",
    model: "gemini-2.5-flash",
    maxRetries: 2,
    retryDelayMs: 1
  });

  assert.equal(result.text, "ok");
  assert.equal(attempts, 2);
});

test("circuit breaker opens after repeated terminal failures and blocks the next request", async () => {
  const adapter = createMemoryCircuitAdapter();
  setCircuitStateAdapterForTests(adapter);

  for (let index = 0; index < 3; index += 1) {
    await assert.rejects(
      withProviderRetries(async () => {
        throw new ProviderRequestError("downstream failed", {
          provider: "ollama",
          operation: "embed-text",
          retryable: false
        });
      }, {
        provider: "ollama",
        operation: "embed-text",
        model: "nomic-embed-text",
        maxRetries: 1,
        retryDelayMs: 1
      })
    );
  }

  const state = await adapter.getCircuitState("ollama", "embed-text", "nomic-embed-text");
  assert.equal(state.state, "open");
  assert.equal(state.consecutive_failures, 3);

  await assert.rejects(
    withProviderRetries(async () => ({ text: "should not run" }), {
      provider: "ollama",
      operation: "embed-text",
      model: "nomic-embed-text",
      maxRetries: 1,
      retryDelayMs: 1
    }),
    (error) => {
      assert.equal(error.name, "ProviderRequestError");
      assert.match(error.message, /Circuit breaker is open/);
      return true;
    }
  );
});

test("provider policy keeps question answering fallback metadata available", () => {
  const policy = getProviderPolicy("question_answer");

  assert.equal(typeof policy.allowOllamaFallback, "boolean");
  assert.ok(policy.fallbackModel);
  assert.equal(policy.fallbackLabel, "question-answer-fallback");
});
