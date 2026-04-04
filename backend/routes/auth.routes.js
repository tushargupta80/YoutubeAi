import { Router } from "express";
import { bootstrap, listSessions, login, logout, logoutAll, me, refresh, register, revokeSession } from "../api/auth.controller.js";
import { env } from "../config/env.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

export const authRouter = Router();

const authRateLimit = createRateLimitMiddleware({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  namespace: "auth"
});

authRouter.post("/register", authRateLimit, register);
authRouter.post("/login", authRateLimit, login);
authRouter.post("/refresh", authRateLimit, refresh);
authRouter.post("/logout", optionalAuth, logout);
authRouter.post("/logout-all", requireAuth, logoutAll);
authRouter.get("/me", requireAuth, me);
authRouter.get("/bootstrap", requireAuth, bootstrap);
authRouter.get("/sessions", requireAuth, listSessions);
authRouter.post("/sessions/:sessionId/revoke", requireAuth, revokeSession);
