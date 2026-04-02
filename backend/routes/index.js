import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { adminRouter } from "./admin.routes.js";
import { notesRouter } from "./notes.routes.js";
import { questionsRouter } from "./questions.routes.js";
import { settingsRouter } from "./settings.routes.js";
import { billingRouter } from "./billing.routes.js";
import { env } from "../config/env.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

export const router = Router();

const apiRateLimit = createRateLimitMiddleware({
  windowMs: env.apiRateLimitWindowMs,
  max: env.apiRateLimitMax,
  namespace: "api"
});

const adminRateLimit = createRateLimitMiddleware({
  windowMs: env.adminRateLimitWindowMs,
  max: env.adminRateLimitMax,
  namespace: "admin"
});

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use("/auth", authRouter);
router.use(apiRateLimit);
router.use(requireAuth);
router.use("/settings", settingsRouter);
router.use("/billing", billingRouter);
router.use("/admin", adminRateLimit, requireAdmin, adminRouter);
router.use(notesRouter);
router.use(questionsRouter);
