import { env } from "../config/env.js";
import { FaissStore } from "./faiss-store.js";
import { PostgresVectorStore } from "./vector-store.postgres.js";

const providers = {
  faiss: () => new FaissStore(),
  postgres: () => new PostgresVectorStore(),
  pgvector: () => new PostgresVectorStore()
};

const providerName = env.vectorStoreProvider || (env.isProduction ? "postgres" : "postgres");
const createStore = providers[providerName] || providers.postgres;

export const vectorStore = createStore();
export const activeVectorStoreProvider = providerName;
