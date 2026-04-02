import test from "node:test";
import assert from "node:assert/strict";
import { requireAdmin, requireAuth, requireRole } from "../middleware/auth.js";
import { errorHandler, notFoundHandler } from "../middleware/error-handler.js";
import {
  createRateLimitMiddleware,
  resetRateLimitStorageAdapterForTests,
  setRateLimitStorageAdapterForTests
} from "../middleware/rate-limit.js";
import { signToken } from "../utils/auth.js";

function createResponseDouble() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    }
  };
}

test("requireAuth accepts a valid bearer token and attaches role", async () => {
  const token = signToken({
    sub: "user-1",
    email: "user@example.com",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 60
  });

  const req = {
    headers: { authorization: `Bearer ${token}` },
    id: "req-1"
  };
  const res = createResponseDouble();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.sub, "user-1");
  assert.equal(req.user.role, "admin");
});

test("requireAdmin blocks non-admin users", async () => {
  const req = {
    id: "req-2",
    user: { sub: "user-2", role: "user" }
  };
  const res = createResponseDouble();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, "Forbidden");
});

test("requireRole allows listed roles", async () => {
  const middleware = requireRole("admin", "support");
  const req = {
    id: "req-3",
    user: { sub: "user-3", role: "support" }
  };
  const res = createResponseDouble();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("rate limit middleware returns 429 after limit is exceeded", async () => {
  const buckets = new Map();
  setRateLimitStorageAdapterForTests({
    async increment(key, windowMs) {
      const current = buckets.get(key) || { count: 0, resetAt: Date.now() + windowMs };
      current.count += 1;
      buckets.set(key, current);
      return current;
    }
  });

  const middleware = createRateLimitMiddleware({
    windowMs: 1000,
    max: 1,
    namespace: `test-rate-${Date.now()}`
  });

  const req = {
    id: "req-4",
    ip: "127.0.0.1",
    headers: {}
  };

  const firstRes = createResponseDouble();
  let firstNext = false;
  await middleware(req, firstRes, () => {
    firstNext = true;
  });
  assert.equal(firstNext, true);

  const secondRes = createResponseDouble();
  let secondNext = false;
  await middleware(req, secondRes, () => {
    secondNext = true;
  });
  assert.equal(secondNext, false);
  assert.equal(secondRes.statusCode, 429);
  assert.equal(secondRes.payload.error, "Too many requests");

  resetRateLimitStorageAdapterForTests();
});

test("notFoundHandler returns request-aware 404 payload", async () => {
  const req = { id: "req-5" };
  const res = createResponseDouble();

  notFoundHandler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.requestId, "req-5");
});

test("errorHandler hides internal errors and exposes request id", async () => {
  const req = {
    id: "req-6",
    method: "GET",
    originalUrl: "/api/test",
    user: { sub: "user-6" }
  };
  const res = createResponseDouble();

  errorHandler(new Error("sensitive message"), req, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error, "Internal server error");
  assert.equal(res.payload.requestId, "req-6");
});
