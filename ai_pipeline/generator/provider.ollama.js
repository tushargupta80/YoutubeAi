import { env } from "../../backend/config/env.js";
import { estimateUsageCost } from "./provider-costs.js";
import { buildProviderError, isRetryableStatus, ProviderRequestError, withProviderRetries } from "./provider.js";

function extractOllamaUsage(data, model) {
  const inputTokens = Number(data?.prompt_eval_count || 0);
  const outputTokens = Number(data?.eval_count || 0);
  return estimateUsageCost("ollama", model, inputTokens, outputTokens);
}

export async function callOllamaGenerate({
  prompt,
  operation = "generate-text",
  model = env.ollamaChatModel,
  options = {},
  timeoutMs = env.ollamaTimeoutMs,
  maxRetries = env.ollamaMaxRetries
}) {
  if (!env.ollamaBaseUrl) {
    throw new ProviderRequestError("Ollama base URL is not configured.", {
      provider: "ollama",
      operation,
      retryable: false
    });
  }

  const result = await withProviderRetries(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${env.ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options
        })
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderRequestError(`Ollama generate failed with status ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`, {
          provider: "ollama",
          operation,
          statusCode: response.status,
          retryable: isRetryableStatus(response.status),
          details: { model }
        });
      }

      const data = await response.json().catch(() => ({}));
      const text = data?.response?.trim?.() || data?.response || "";
      if (!text) {
        throw new ProviderRequestError("Ollama returned an empty response.", {
          provider: "ollama",
          operation,
          retryable: true,
          details: { model }
        });
      }

      return {
        text,
        usage: extractOllamaUsage(data, model)
      };
    } catch (error) {
      throw buildProviderError(
        error,
        `Ollama request timed out after ${Math.round(timeoutMs / 1000)}s`,
        {
          provider: "ollama",
          operation,
          details: { model }
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }, {
    provider: "ollama",
    operation,
    model,
    maxRetries
  });

  return result;
}

export async function callOllamaEmbedding({
  input,
  operation = "embed-text",
  model = env.ollamaEmbedModel,
  timeoutMs = env.ollamaTimeoutMs,
  maxRetries = env.ollamaMaxRetries
}) {
  if (!env.ollamaBaseUrl) {
    throw new ProviderRequestError("Ollama base URL is not configured.", {
      provider: "ollama",
      operation,
      retryable: false
    });
  }

  const result = await withProviderRetries(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${env.ollamaBaseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt: input
        })
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderRequestError(`Ollama embeddings failed with status ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`, {
          provider: "ollama",
          operation,
          statusCode: response.status,
          retryable: isRetryableStatus(response.status),
          details: { model }
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!Array.isArray(data?.embedding) || !data.embedding.length) {
        throw new ProviderRequestError("Ollama returned an empty embedding.", {
          provider: "ollama",
          operation,
          retryable: true,
          details: { model }
        });
      }

      return {
        embedding: data.embedding,
        usage: extractOllamaUsage(data, model)
      };
    } catch (error) {
      throw buildProviderError(
        error,
        `Ollama embeddings request timed out after ${Math.round(timeoutMs / 1000)}s`,
        {
          provider: "ollama",
          operation,
          details: { model }
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }, {
    provider: "ollama",
    operation,
    model,
    maxRetries
  });

  return result;
}

export async function listOllamaModels() {
  const response = await fetch(`${env.ollamaBaseUrl}/api/tags`);
  if (!response.ok) {
    throw new ProviderRequestError(`Ollama responded with status ${response.status}`, {
      provider: "ollama",
      operation: "diagnostics-list-models",
      statusCode: response.status,
      retryable: isRetryableStatus(response.status)
    });
  }

  const data = await response.json().catch(() => ({}));
  return (data.models || []).map((model) => model.name);
}

export async function pingOllama() {
  const models = await listOllamaModels();
  return {
    ok: true,
    models,
    message: "Ollama reachable"
  };
}
