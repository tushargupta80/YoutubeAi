import { createEmbedding } from "../embeddings/ollamaEmbeddings.js";
import { vectorStore } from "../../backend/services/vector-store.js";
import { env } from "../../backend/config/env.js";

export async function retrieveRelevantChunks(videoId, query, topK = env.defaultTopK) {
  const queryEmbedding = await createEmbedding(query);
  return vectorStore.search(videoId, queryEmbedding, topK);
}