import { useMemo, useState } from "react";
import { getDiagnostics } from "@/services/api";

export function useDiagnostics(settings) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const warnings = useMemo(() => {
    if (!settings) return [];

    const items = [];
    const fallbackModel = settings.ollamaFallbackModel || "";
    const knownSlowCpuModels = ["llama3", "qwen2.5:3b", "qwen2.5:7b", "mistral"];

    if (!settings.geminiConfigured && knownSlowCpuModels.some((model) => fallbackModel.includes(model))) {
      items.push(`Fallback model \`${fallbackModel}\` may be slow on CPU-only runs. For better reliability, use \`phi3:mini\`.`);
    }

    if (diagnostics?.ollama?.ok && fallbackModel && !diagnostics.ollama.models?.includes(fallbackModel)) {
      items.push(`Fallback model \`${fallbackModel}\` is not currently pulled into Ollama. Run \`ollama pull ${fallbackModel}\`.`);
    }

    if (diagnostics?.ollama?.ok && settings.ollamaPreprocessModel && !diagnostics.ollama.models?.includes(settings.ollamaPreprocessModel)) {
      items.push(`Preprocess model \`${settings.ollamaPreprocessModel}\` is not currently pulled into Ollama. Run \`ollama pull ${settings.ollamaPreprocessModel}\`.`);
    }

    return items;
  }, [settings, diagnostics]);

  async function runChecks() {
    setLoading(true);
    setError("");
    try {
      const response = await getDiagnostics();
      setDiagnostics(response.diagnostics);
      return response.diagnostics;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }

  return {
    diagnostics,
    loading,
    error,
    warnings,
    runChecks
  };
}
