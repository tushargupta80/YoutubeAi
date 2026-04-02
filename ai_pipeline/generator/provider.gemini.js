import { env } from "../../backend/config/env.js";
import { estimateUsageCost } from "./provider-costs.js";
import { buildProviderError, isRetryableStatus, ProviderRequestError, withProviderRetries } from "./provider.js";

function getGeminiEndpoint(model = env.geminiModel) {
  return `${env.geminiBaseUrl.replace(/\/openai\/?$/, "")}/models/${model}:generateContent?key=${env.geminiApiKey}`;
}

function extractGeminiText(data) {
  return (data?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("")
    .trim();
}

function extractGeminiUsage(data, model) {
  const inputTokens = Number(data?.usageMetadata?.promptTokenCount || 0);
  const outputTokens = Number(data?.usageMetadata?.candidatesTokenCount || 0);
  return estimateUsageCost("gemini", model, inputTokens, outputTokens);
}

export async function callGeminiText({
  prompt,
  operation = "generate-text",
  model = env.geminiModel,
  temperature = 0.2,
  maxOutputTokens = 2048,
  json = false,
  timeoutMs = env.geminiTimeoutMs,
  maxRetries = env.geminiMaxRetries
}) {
  if (!env.geminiApiKey) {
    throw new ProviderRequestError("Gemini API key is not configured.", {
      provider: "gemini",
      operation,
      retryable: false
    });
  }

  const result = await withProviderRetries(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(getGeminiEndpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(json ? { responseMimeType: "application/json" } : {})
          }
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ProviderRequestError(data?.error?.message || `Gemini responded with status ${response.status}`, {
          provider: "gemini",
          operation,
          statusCode: response.status,
          retryable: isRetryableStatus(response.status),
          details: { model }
        });
      }

      const text = extractGeminiText(data);
      if (!text) {
        throw new ProviderRequestError("Gemini returned an empty response.", {
          provider: "gemini",
          operation,
          retryable: true,
          details: { model }
        });
      }

      return {
        text,
        usage: extractGeminiUsage(data, model)
      };
    } catch (error) {
      throw buildProviderError(
        error,
        `Gemini request timed out after ${Math.round(timeoutMs / 1000)}s`,
        {
          provider: "gemini",
          operation,
          details: { model }
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }, {
    provider: "gemini",
    operation,
    model,
    maxRetries
  });

  return result;
}

export async function pingGemini() {
  await callGeminiText({
    prompt: "Reply with ok.",
    operation: "diagnostics-ping",
    temperature: 0,
    maxOutputTokens: 8,
    json: false,
    timeoutMs: 30000,
    maxRetries: 1
  });

  return { ok: true, message: "Gemini reachable" };
}
