import { adminCancelJob, adminReplayDeadLetter, adminRevokeSession, getAdminOverview, updateUserRole } from "../services/admin.repository.js";

const ALLOWED_ROLES = new Set(["user", "support", "analyst", "admin"]);

export async function getOverview(req, res, next) {
  try {
    const limit = Number(req.query.limit || 8);
    const days = Number(req.query.days || 7);
    const usersBefore = req.query.users_before || null;
    const jobsBefore = req.query.jobs_before || null;
    const logsBefore = req.query.logs_before || null;
    const deadLettersBefore = req.query.dead_letters_before || null;
    const overview = await getAdminOverview({ limit, days, usersBefore, jobsBefore, logsBefore, deadLettersBefore });
    return res.json(overview);
  } catch (error) {
    return next(error);
  }
}

export async function updateRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = await updateUserRole(req.params.userId, role);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

export async function cancelJob(req, res, next) {
  try {
    const job = await adminCancelJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    return res.json({ job });
  } catch (error) {
    return next(error);
  }
}

export async function revokeSession(req, res, next) {
  try {
    const session = await adminRevokeSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.json({ ok: true, session });
  } catch (error) {
    return next(error);
  }
}

export async function replayDeadLetter(req, res, next) {
  try {
    const replay = await adminReplayDeadLetter(req.params.deadLetterId);
    if (!replay) {
      return res.status(404).json({ error: "Dead-letter entry not found" });
    }
    return res.json({ ok: true, replay });
  } catch (error) {
    return next(error);
  }
}
