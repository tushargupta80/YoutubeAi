import { Router } from "express";
import { cancelJob, getOverview, replayDeadLetter, revokeSession, updateRole } from "../api/admin.controller.js";

export const adminRouter = Router();

adminRouter.get("/overview", getOverview);
adminRouter.patch("/users/:userId/role", updateRole);
adminRouter.post("/jobs/:jobId/cancel", cancelJob);
adminRouter.post("/sessions/:sessionId/revoke", revokeSession);
adminRouter.post("/dead-letters/:deadLetterId/replay", replayDeadLetter);
