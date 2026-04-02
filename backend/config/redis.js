import IORedis from "ioredis";
import { env } from "./env.js";
import { recordDependencyHealth } from "../services/metrics.service.js";

export const redis = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  }
});

export async function checkRedisHealth() {
  const start = Date.now();
  try {
    const response = await redis.ping();
    const result = { ok: response === "PONG", latencyMs: Date.now() - start };
    recordDependencyHealth("redis", result);
    return result;
  } catch (error) {
    const result = { ok: false, latencyMs: Date.now() - start, error: error.message || "redis health failed" };
    recordDependencyHealth("redis", result);
    throw error;
  }
}

export async function closeRedis() {
  await redis.quit();
}
