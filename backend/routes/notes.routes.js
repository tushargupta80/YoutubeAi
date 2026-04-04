import { Router } from "express";
import { cancelJob, deleteJob, generateNotes, generateNotesFromTranscript, getJob, getRecentJobs } from "../api/notes.controller.js";
import { env } from "../config/env.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

export const notesRouter = Router();

const generateNotesRateLimit = createRateLimitMiddleware({
  windowMs: env.generateNotesRateLimitWindowMs,
  max: env.generateNotesRateLimitMax,
  namespace: "generate-notes"
});

notesRouter.post("/generate-notes", generateNotesRateLimit, generateNotes);
notesRouter.post("/generate-notes/transcript", generateNotesRateLimit, generateNotesFromTranscript);
notesRouter.get("/jobs", getRecentJobs);
notesRouter.get("/jobs/:jobId", getJob);
notesRouter.post("/jobs/:jobId/cancel", cancelJob);
notesRouter.delete("/jobs/:jobId", deleteJob);
