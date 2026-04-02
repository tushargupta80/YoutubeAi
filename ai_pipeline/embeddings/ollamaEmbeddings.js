import { callOllamaEmbedding } from "../generator/provider.ollama.js";

export async function createEmbedding(input) {
  const result = await callOllamaEmbedding({
    input,
    operation: "embed-single"
  });

  return result.embedding;
}

export async function createEmbeddings(inputs) {
  const output = [];
  for (const input of inputs) {
    output.push(await createEmbedding(input));
  }
  return output;
}
