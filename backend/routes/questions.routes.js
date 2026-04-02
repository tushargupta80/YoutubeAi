import { Router } from "express";
import { askQuestion } from "../api/questions.controller.js";
import { env } from "../config/env.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

export const questionsRouter = Router();

const questionRateLimit = createRateLimitMiddleware({
  windowMs: env.questionRateLimitWindowMs,
  max: env.questionRateLimitMax,
  namespace: "questions"
});

questionsRouter.post("/ask-question", questionRateLimit, askQuestion);
