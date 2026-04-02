import { env } from "../../backend/config/env.js";
import { callOllamaGenerate } from "./provider.ollama.js";

export async function generateWithOllama(prompt, options = {}, modelOverride = env.ollamaFallbackModel) {
  const result = await callOllamaGenerate({
    prompt,
    options,
    model: modelOverride,
    operation: "fallback-generate"
  });
  return result.text;
}

export async function cleanTranscriptWithOllama(prompt) {
  const result = await callOllamaGenerate({
    prompt,
    options: { temperature: 0.1, num_predict: 500 },
    model: env.ollamaPreprocessModel,
    operation: "cleanup-transcript"
  });
  return result.text;
}

export async function extractConceptsWithOllama(prompt) {
  const result = await callOllamaGenerate({
    prompt,
    options: { temperature: 0.1, num_predict: 220 },
    model: env.ollamaPreprocessModel,
    operation: "extract-concepts"
  });

  try {
    return JSON.parse(result.text);
  } catch {
    return {
      summary: result.text,
      concepts: [],
      examples: [],
      caveats: []
    };
  }
}
