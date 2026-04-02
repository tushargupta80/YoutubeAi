import { redis } from "../config/redis.js";

const memoryBuckets = new Map();
let rateLimitStorageAdapter = null;

function now() {
  return Date.now();
}

function getClientIdentifier(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = typeof forwardedFor === "string" && forwardedFor.trim() ? forwardedFor.split(",")[0].trim() : req.ip || "unknown";
  const userScope = req.user?.sub ? `user:${req.user.sub}` : `ip:${ip}`;
  return userScope;
}

async function incrementWithRedis(key, windowMs) {
  const currentTime = now();
  const result = await redis.multi().incr(key).pttl(key).exec();
  const count = Number(result?.[0]?.[1] || 0);
  let ttl = Number(result?.[1]?.[1] || -1);

  if (ttl < 0) {
    await redis.pexpire(key, windowMs);
    ttl = windowMs;
  }

  return {
    count,
    resetAt: currentTime + ttl
  };
}

function incrementWithMemory(key, windowMs) {
  const currentTime = now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= currentTime) {
    const nextBucket = {
      count: 1,
      resetAt: currentTime + windowMs
    };
    memoryBuckets.set(key, nextBucket);
    return nextBucket;
  }

  bucket.count += 1;
  memoryBuckets.set(key, bucket);
  return bucket;
}

async function incrementRateLimitBucket(key, windowMs) {
  if (rateLimitStorageAdapter?.increment) {
    return rateLimitStorageAdapter.increment(key, windowMs);
  }

  try {
    return await incrementWithRedis(key, windowMs);
  } catch {
    return incrementWithMemory(key, windowMs);
  }
}

export function createRateLimitMiddleware({ windowMs, max, namespace }) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const key = `rate-limit:${namespace}:${getClientIdentifier(req)}`;
      const bucket = await incrementRateLimitBucket(key, windowMs);
      const remaining = Math.max(max - bucket.count, 0);

      res.setHeader("x-rate-limit-limit", String(max));
      res.setHeader("x-rate-limit-remaining", String(remaining));
      res.setHeader("x-rate-limit-reset", String(Math.ceil(bucket.resetAt / 1000)));

      if (bucket.count > max) {
        return res.status(429).json({
          error: "Too many requests",
          requestId: req.id
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function setRateLimitStorageAdapterForTests(adapter) {
  rateLimitStorageAdapter = adapter;
}

export function resetRateLimitStorageAdapterForTests() {
  rateLimitStorageAdapter = null;
  memoryBuckets.clear();
}
