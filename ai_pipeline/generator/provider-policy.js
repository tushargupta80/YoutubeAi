import { env } from "../../backend/config/env.js";

const policies = {
  structured_notes: {
    allowOllamaFallback: !env.disableCloudFallback,
    fallbackModel: env.ollamaFallbackModel,
    fallbackLabel: "structured-notes-fallback"
  },
  concept_extraction: {
    allowOllamaFallback: true,
    fallbackModel: env.ollamaPreprocessModel,
    fallbackLabel: "concept-extraction-fallback"
  },
  question_answer: {
    allowOllamaFallback: !env.disableCloudFallback,
    fallbackModel: env.ollamaPreprocessModel,
    fallbackLabel: "question-answer-fallback"
  },
  diagnostics: {
    allowOllamaFallback: false,
    fallbackModel: env.ollamaPreprocessModel,
    fallbackLabel: "diagnostics"
  },
  embeddings: {
    allowOllamaFallback: false,
    fallbackModel: env.ollamaEmbedModel,
    fallbackLabel: "embeddings"
  }
};

export function getProviderPolicy(operation) {
  return policies[operation] || {
    allowOllamaFallback: !env.disableCloudFallback,
    fallbackModel: env.ollamaFallbackModel,
    fallbackLabel: operation
  };
}
