import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

function parseNumber(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function requiredInProduction(name, value, errors) {
  if (!value && process.env.NODE_ENV === "production") {
    errors.push(`${name} is required in production`);
  }
}

const errors = [];
const nodeEnv = process.env.NODE_ENV || "development";
const vectorStoreProvider = process.env.VECTOR_STORE_PROVIDER || "postgres";
const env = {
  port: parseNumber(process.env.PORT, 4000),
  serviceName: process.env.SERVICE_NAME || "backend",
  siteName: process.env.SITE_NAME || "AI Notes",
  nodeEnv,
  isProduction: nodeEnv === "production",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/youtube_notes",
  dbSsl: parseBoolean(process.env.DB_SSL, false),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "llama3",
  ollamaPreprocessModel: process.env.OLLAMA_PREPROCESS_MODEL || process.env.OLLAMA_CHAT_MODEL || "phi3:mini",
  ollamaFallbackModel: process.env.OLLAMA_FALLBACK_MODEL || process.env.OLLAMA_CHAT_MODEL || "qwen2.5:3b",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  ollamaTimeoutMs: parseNumber(process.env.OLLAMA_TIMEOUT_MS, 90 * 1000),
  ollamaMaxRetries: parseNumber(process.env.OLLAMA_MAX_RETRIES, 2),
  ollamaInputCostPer1kUsd: parseNumber(process.env.OLLAMA_INPUT_COST_PER_1K_USD, 0),
  ollamaOutputCostPer1kUsd: parseNumber(process.env.OLLAMA_OUTPUT_COST_PER_1K_USD, 0),
  ollamaModelCostsJson: process.env.OLLAMA_MODEL_COSTS_JSON || "",
  geminiBaseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiTimeoutMs: parseNumber(process.env.GEMINI_TIMEOUT_MS, 120 * 1000),
  geminiMaxRetries: parseNumber(process.env.GEMINI_MAX_RETRIES, 2),
  geminiInputCostPer1kUsd: parseNumber(process.env.GEMINI_INPUT_COST_PER_1K_USD, 0),
  geminiOutputCostPer1kUsd: parseNumber(process.env.GEMINI_OUTPUT_COST_PER_1K_USD, 0),
  geminiModelCostsJson: process.env.GEMINI_MODEL_COSTS_JSON || "",
  disableCloudFallback: parseBoolean(process.env.DISABLE_CLOUD_FALLBACK),
  providerRequestLogEnabled: parseBoolean(process.env.PROVIDER_REQUEST_LOG_ENABLED, true),
  providerCircuitBreakerEnabled: parseBoolean(process.env.PROVIDER_CIRCUIT_BREAKER_ENABLED, true),
  providerCircuitBreakerFailureThreshold: parseNumber(process.env.PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD, 3),
  providerCircuitBreakerCooldownMs: parseNumber(process.env.PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS, 120000),
  vectorStoreProvider,
  pgvectorAnnEnabled: parseBoolean(process.env.PGVECTOR_ANN_ENABLED, true),
  pgvectorAnnIndexType: process.env.PGVECTOR_ANN_INDEX_TYPE || "hnsw",
  pgvectorSearchCandidateMultiplier: parseNumber(process.env.PGVECTOR_SEARCH_CANDIDATE_MULTIPLIER, 25),
  pgvectorIvfflatProbes: parseNumber(process.env.PGVECTOR_IVFFLAT_PROBES, 10),
  pgvectorHnswEfSearch: parseNumber(process.env.PGVECTOR_HNSW_EF_SEARCH, 80),
  vectorIndexDir: process.env.VECTOR_INDEX_DIR || path.resolve(__dirname, "../data/faiss"),
  defaultTopK: parseNumber(process.env.DEFAULT_TOP_K, 6),
  authSecret: process.env.AUTH_SECRET || "",
  authCookieName: process.env.AUTH_COOKIE_NAME || "youtube_notes_session",
  authRefreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME || "youtube_notes_refresh",
  authCookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, nodeEnv === "production"),
  authCookieSameSite: (process.env.AUTH_COOKIE_SAME_SITE || (nodeEnv === "production" ? "none" : "lax")).toLowerCase(),
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN || "",
  authCookieMaxAgeMs: parseNumber(process.env.AUTH_COOKIE_MAX_AGE_MS, 15 * 60 * 1000),
  authAccessTokenTtlSeconds: parseNumber(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS, 15 * 60),
  authRefreshTokenMaxAgeMs: parseNumber(process.env.AUTH_REFRESH_TOKEN_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000),
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, nodeEnv === "production"),
  shutdownTimeoutMs: parseNumber(process.env.SHUTDOWN_TIMEOUT_MS, 15000),
  healthCheckTimeoutMs: parseNumber(process.env.HEALTHCHECK_TIMEOUT_MS, 3000),
  observabilityMetricsWindowSize: parseNumber(process.env.OBSERVABILITY_METRICS_WINDOW_SIZE, 1000),
  dbPoolMax: parseNumber(process.env.DB_POOL_MAX, nodeEnv === "production" ? 20 : 10),
  dbIdleTimeoutMs: parseNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  dbConnectionTimeoutMs: parseNumber(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  authRateLimitWindowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  authRateLimitMax: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 20),
  apiRateLimitWindowMs: parseNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  apiRateLimitMax: parseNumber(process.env.API_RATE_LIMIT_MAX, 120),
  adminRateLimitWindowMs: parseNumber(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  adminRateLimitMax: parseNumber(process.env.ADMIN_RATE_LIMIT_MAX, 60),
  generateNotesRateLimitWindowMs: parseNumber(process.env.GENERATE_NOTES_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  generateNotesRateLimitMax: parseNumber(process.env.GENERATE_NOTES_RATE_LIMIT_MAX, 12),
  questionRateLimitWindowMs: parseNumber(process.env.QUESTION_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),
  questionRateLimitMax: parseNumber(process.env.QUESTION_RATE_LIMIT_MAX, 40),
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  workerIngestConcurrency: parseNumber(process.env.WORKER_INGEST_CONCURRENCY, 2),
  workerEmbedConcurrency: parseNumber(process.env.WORKER_EMBED_CONCURRENCY, 2),
  workerNotesConcurrency: parseNumber(process.env.WORKER_NOTES_CONCURRENCY, 1),
  workerQaConcurrency: parseNumber(process.env.WORKER_QA_CONCURRENCY, 2),
  observabilityLogSinkUrl: process.env.OBSERVABILITY_LOG_SINK_URL || "",
  observabilityLogSinkToken: process.env.OBSERVABILITY_LOG_SINK_TOKEN || "",
  billingStarterCredits: parseNumber(process.env.BILLING_STARTER_CREDITS, 20),
  noteGenerationCreditCost: parseNumber(process.env.NOTE_GENERATION_CREDIT_COST, 10),
  questionCreditCost: parseNumber(process.env.QUESTION_CREDIT_COST, 1),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayCurrency: process.env.RAZORPAY_CURRENCY || "INR"
};

if (env.port <= 0) errors.push("PORT must be a positive number");
if (env.defaultTopK <= 0) errors.push("DEFAULT_TOP_K must be a positive number");
if (env.dbPoolMax <= 0) errors.push("DB_POOL_MAX must be a positive number");
if (env.ollamaTimeoutMs <= 0) errors.push("OLLAMA_TIMEOUT_MS must be a positive number");
if (env.geminiTimeoutMs <= 0) errors.push("GEMINI_TIMEOUT_MS must be a positive number");
if (env.ollamaMaxRetries <= 0) errors.push("OLLAMA_MAX_RETRIES must be a positive number");
if (env.geminiMaxRetries <= 0) errors.push("GEMINI_MAX_RETRIES must be a positive number");
if (env.providerCircuitBreakerFailureThreshold <= 0) errors.push("PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD must be a positive number");
if (env.providerCircuitBreakerCooldownMs <= 0) errors.push("PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS must be a positive number");
if (env.pgvectorSearchCandidateMultiplier <= 0) errors.push("PGVECTOR_SEARCH_CANDIDATE_MULTIPLIER must be a positive number");
if (env.pgvectorIvfflatProbes <= 0) errors.push("PGVECTOR_IVFFLAT_PROBES must be a positive number");
if (env.pgvectorHnswEfSearch <= 0) errors.push("PGVECTOR_HNSW_EF_SEARCH must be a positive number");
if (env.authRateLimitWindowMs <= 0) errors.push("AUTH_RATE_LIMIT_WINDOW_MS must be a positive number");
if (env.authRateLimitMax <= 0) errors.push("AUTH_RATE_LIMIT_MAX must be a positive number");
if (env.apiRateLimitWindowMs <= 0) errors.push("API_RATE_LIMIT_WINDOW_MS must be a positive number");
if (env.apiRateLimitMax <= 0) errors.push("API_RATE_LIMIT_MAX must be a positive number");
if (env.adminRateLimitWindowMs <= 0) errors.push("ADMIN_RATE_LIMIT_WINDOW_MS must be a positive number");
if (env.adminRateLimitMax <= 0) errors.push("ADMIN_RATE_LIMIT_MAX must be a positive number");
if (env.generateNotesRateLimitWindowMs <= 0) errors.push("GENERATE_NOTES_RATE_LIMIT_WINDOW_MS must be a positive number");
if (env.generateNotesRateLimitMax <= 0) errors.push("GENERATE_NOTES_RATE_LIMIT_MAX must be a positive number");
if (env.questionRateLimitWindowMs <= 0) errors.push("QUESTION_RATE_LIMIT_WINDOW_MS must be a positive number");
if (env.questionRateLimitMax <= 0) errors.push("QUESTION_RATE_LIMIT_MAX must be a positive number");
if (env.authCookieMaxAgeMs <= 0) errors.push("AUTH_COOKIE_MAX_AGE_MS must be a positive number");
if (env.authAccessTokenTtlSeconds <= 0) errors.push("AUTH_ACCESS_TOKEN_TTL_SECONDS must be a positive number");
if (env.authRefreshTokenMaxAgeMs <= 0) errors.push("AUTH_REFRESH_TOKEN_MAX_AGE_MS must be a positive number");
if (!['lax', 'strict', 'none'].includes(env.authCookieSameSite)) errors.push("AUTH_COOKIE_SAME_SITE must be one of lax, strict, or none");
if (env.authCookieSameSite === 'none' && !env.authCookieSecure) errors.push("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none");
if (env.workerIngestConcurrency <= 0) errors.push("WORKER_INGEST_CONCURRENCY must be a positive number");
if (env.workerEmbedConcurrency <= 0) errors.push("WORKER_EMBED_CONCURRENCY must be a positive number");
if (env.workerNotesConcurrency <= 0) errors.push("WORKER_NOTES_CONCURRENCY must be a positive number");
if (env.workerQaConcurrency <= 0) errors.push("WORKER_QA_CONCURRENCY must be a positive number");
if (env.observabilityMetricsWindowSize <= 0) errors.push("OBSERVABILITY_METRICS_WINDOW_SIZE must be a positive number");
if (env.billingStarterCredits < 0) errors.push("BILLING_STARTER_CREDITS must be zero or more");
if (env.noteGenerationCreditCost <= 0) errors.push("NOTE_GENERATION_CREDIT_COST must be a positive number");
if (env.questionCreditCost <= 0) errors.push("QUESTION_CREDIT_COST must be a positive number");
if (!["postgres", "faiss", "pgvector"].includes(env.vectorStoreProvider)) errors.push("VECTOR_STORE_PROVIDER must be one of 'postgres', 'faiss', or 'pgvector'");
if (!["hnsw", "ivfflat"].includes(env.pgvectorAnnIndexType)) errors.push("PGVECTOR_ANN_INDEX_TYPE must be either 'hnsw' or 'ivfflat'");
requiredInProduction("AUTH_SECRET", env.authSecret, errors);
requiredInProduction("DATABASE_URL", env.databaseUrl, errors);
requiredInProduction("REDIS_URL", env.redisUrl, errors);

if (errors.length) {
  throw new Error(`Invalid environment configuration: ${errors.join("; ")}`);
}

export { env };
