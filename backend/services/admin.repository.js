import { env } from "../config/env.js";
import { query } from "../config/db.js";
import { cancelPipelineJobs, getQueueObservabilitySnapshot, replayQueueJob } from "./queue.js";
import {
  getDailyProviderUsage,
  getProviderLatencySummary,
  getProviderUsageSummary,
  getProviderUsageTotals
} from "./provider-events.repository.js";
import { listRecentRequestLogs } from "./request-log.repository.js";
import { getNoteJobRecord } from "./notes.repository.js";
import { refundCreditsForNoteJob } from "./billing.service.js";
import { isCancelledJobRecord, markJobCancelled } from "./job-cancellation.js";
import { listRecentQueueDeadLetters, getQueueDeadLetterById, markQueueDeadLetterReplayed } from "./queue-dead-letter.repository.js";
import { listRecentRefreshSessions, revokeRefreshSessionById } from "./auth.repository.js";

async function listRecentUsers(limit, before) {
  const values = [];
  const filters = [];

  if (before) {
    values.push(before);
    filters.push(`created_at < $${values.length}`);
  }

  values.push(limit + 1);

  const result = await query(
    `SELECT id, email, name, role, created_at
     FROM users
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const users = hasMore ? rows.slice(0, limit) : rows;

  return {
    users,
    nextCursor: hasMore ? users.at(-1)?.created_at || null : null,
    hasMore
  };
}

async function listRecentJobs(limit, before) {
  const values = [];
  const filters = [];

  if (before) {
    values.push(before);
    filters.push(`nj.created_at < $${values.length}`);
  }

  values.push(limit + 1);

  const result = await query(
    `SELECT nj.id, nj.status, nj.stage, nj.progress, nj.error_message, nj.generation_provider, nj.processing_seconds, nj.created_at,
            v.title AS video_title,
            u.email AS user_email,
            u.name AS user_name,
            u.role AS user_role
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     LEFT JOIN users u ON u.id = nj.user_id
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY nj.created_at DESC
     LIMIT $${values.length}`,
    values
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const jobs = hasMore ? rows.slice(0, limit) : rows;

  return {
    jobs,
    nextCursor: hasMore ? jobs.at(-1)?.created_at || null : null,
    hasMore
  };
}

function buildAutoscalingHints(queueSnapshot, deadLetterSnapshot, providerLatencySummary = []) {
  const queueConcurrencyMap = {
    "notes-ingest": env.workerIngestConcurrency,
    "notes-embed": env.workerEmbedConcurrency,
    "notes-generation": env.workerNotesConcurrency,
    "notes-qa": env.workerQaConcurrency
  };

  const queueHints = (queueSnapshot?.queues || []).map((queue) => {
    const concurrency = Number(queueConcurrencyMap[queue.name] || 1);
    const recommendedMinInstances = 1;
    const recommendedInstances = Math.max(recommendedMinInstances, Math.ceil(Number(queue.backlog || 0) / Math.max(concurrency * 8, 1)) || 1);
    const pressure = Number(queue.backlog || 0) > concurrency * 10 ? "high" : Number(queue.backlog || 0) > concurrency * 4 ? "elevated" : "stable";
    return {
      queue: queue.name,
      currentConcurrencyPerInstance: concurrency,
      backlog: Number(queue.backlog || 0),
      inFlight: Number(queue.inFlight || 0),
      failed: Number(queue.failed || 0),
      pressure,
      recommendedInstances,
      reason: pressure === "high"
        ? "Backlog is significantly above per-instance concurrency capacity."
        : pressure === "elevated"
          ? "Backlog is growing beyond the comfortable steady-state range."
          : "Queue backlog is within a stable operating range."
    };
  });

  const recentDeadLetters = deadLetterSnapshot?.items || [];
  const deadLetterByQueue = recentDeadLetters.reduce((acc, item) => {
    acc[item.queue_name] = (acc[item.queue_name] || 0) + 1;
    return acc;
  }, {});

  const slowestProvider = providerLatencySummary[0] || null;

  return {
    summary: {
      totalBacklog: Number(queueSnapshot?.totals?.backlog || 0),
      totalFailed: Number(queueSnapshot?.totals?.failed || 0),
      recentDeadLetters: recentDeadLetters.length,
      slowestProviderOperation: slowestProvider ? `${slowestProvider.provider}/${slowestProvider.operation}` : "-"
    },
    queues: queueHints.map((hint) => ({
      ...hint,
      recentDeadLetters: deadLetterByQueue[hint.queue] || 0
    }))
  };
}

export async function updateUserRole(userId, role) {
  const result = await query(
    `UPDATE users
     SET role = $2
     WHERE id = $1
     RETURNING id, email, name, role, created_at`,
    [userId, role]
  );

  return result.rows[0] || null;
}

export async function adminCancelJob(jobId) {
  const job = await getNoteJobRecord(jobId);
  if (!job) {
    return null;
  }

  if (["completed", "failed"].includes(job.status) && !isCancelledJobRecord(job)) {
    return job;
  }

  await markJobCancelled(jobId);
  await cancelPipelineJobs(jobId);
  await refundCreditsForNoteJob(jobId, "admin_cancelled");
  return getNoteJobRecord(jobId);
}

export async function adminRevokeSession(sessionId) {
  return revokeRefreshSessionById(sessionId, null);
}

export async function adminReplayDeadLetter(deadLetterId) {
  const deadLetter = await getQueueDeadLetterById(deadLetterId);
  if (!deadLetter) {
    return null;
  }

  const replayedJob = await replayQueueJob({
    queueName: deadLetter.queue_name,
    jobName: deadLetter.job_name,
    payload: deadLetter.payload || {}
  });

  await markQueueDeadLetterReplayed(deadLetterId);

  return {
    deadLetterId,
    queueName: deadLetter.queue_name,
    replayedJobId: replayedJob.id,
    notesJobId: deadLetter.notes_job_id || ""
  };
}

export async function getAdminOverview(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 8), 1), 50);
  const days = Math.min(Math.max(Number(options.days || 7), 1), 90);

  const [
    totalsResult,
    recentUsers,
    recentJobs,
    providerUsageTotals,
    providerUsageSummary,
    providerDailyUsage,
    recentRequestLogs,
    recentSessions,
    deadLetters,
    queueObservability,
    providerLatencySummary
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS users,
         (SELECT COUNT(*)::int FROM note_jobs) AS note_jobs,
         (SELECT COUNT(*)::int FROM note_jobs WHERE status = 'completed') AS completed_jobs,
         (SELECT COUNT(*)::int FROM note_jobs WHERE status IN ('processing', 'queued')) AS processing_jobs,
         (SELECT COUNT(*)::int FROM note_jobs WHERE status = 'failed') AS failed_jobs
       FROM users`
    ),
    listRecentUsers(limit, options.usersBefore || null),
    listRecentJobs(limit, options.jobsBefore || null),
    getProviderUsageTotals(days),
    getProviderUsageSummary(days),
    getDailyProviderUsage(days),
    listRecentRequestLogs(Math.min(limit, 12), options.logsBefore || null),
    listRecentRefreshSessions(Math.min(limit, 10)),
    listRecentQueueDeadLetters(Math.min(limit, 10), options.deadLettersBefore || null),
    getQueueObservabilitySnapshot(),
    getProviderLatencySummary(days)
  ]);

  return {
    totals: {
      users: totalsResult.rows[0]?.users || 0,
      noteJobs: totalsResult.rows[0]?.note_jobs || 0,
      completedJobs: totalsResult.rows[0]?.completed_jobs || 0,
      processingJobs: totalsResult.rows[0]?.processing_jobs || 0,
      failedJobs: totalsResult.rows[0]?.failed_jobs || 0
    },
    providerUsageTotals,
    providerUsageSummary,
    providerDailyUsage,
    providerLatencySummary,
    queueObservability,
    autoscalingHints: buildAutoscalingHints(queueObservability, deadLetters, providerLatencySummary),
    recentUsers: recentUsers.users,
    recentUsersNextCursor: recentUsers.nextCursor,
    recentUsersHasMore: recentUsers.hasMore,
    recentJobs: recentJobs.jobs,
    recentJobsNextCursor: recentJobs.nextCursor,
    recentJobsHasMore: recentJobs.hasMore,
    recentRequestLogs: recentRequestLogs.logs,
    recentRequestLogsNextCursor: recentRequestLogs.nextCursor,
    recentRequestLogsHasMore: recentRequestLogs.hasMore,
    recentSessions,
    deadLetters: deadLetters.items,
    deadLettersNextCursor: deadLetters.nextCursor,
    deadLettersHasMore: deadLetters.hasMore
  };
}
