import express from "express";
import cors from "cors";
import { router } from "../routes/index.js";
import { env } from "../config/env.js";
import { checkDatabaseHealth } from "../config/db.js";
import { checkRedisHealth } from "../config/redis.js";
import { errorHandler, notFoundHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { requestLoggingMiddleware } from "../middleware/request-logger.js";

export const app = express();

let appReady = false;

function getRequestOrigin(origin) {
  if (!origin) return true;
  return env.corsAllowedOrigins.includes(origin);
}

async function withTimeout(task, timeoutMs) {
  return Promise.race([
    task(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs))
  ]);
}

app.set("trust proxy", env.trustProxy);
app.disable("x-powered-by");

app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);
app.use(cors({
  origin(origin, callback) {
    if (getRequestOrigin(origin)) return callback(null, true);
    return callback(new Error("CORS origin not allowed"));
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "backend", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/readyz", async (_req, res) => {
  if (!appReady) {
    return res.status(503).json({ ok: false, ready: false, reason: "startup_incomplete" });
  }

  try {
    const [database, redis] = await Promise.all([
      withTimeout(() => checkDatabaseHealth(), env.healthCheckTimeoutMs),
      withTimeout(() => checkRedisHealth(), env.healthCheckTimeoutMs)
    ]);

    return res.json({
      ok: true,
      ready: true,
      checks: { database, redis }
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      ready: false,
      error: error.message || "readiness check failed"
    });
  }
});

app.use("/api", router);
app.use(notFoundHandler);
app.use(errorHandler);

export function markAppReady() {
  appReady = true;
}

export function markAppNotReady() {
  appReady = false;
}
