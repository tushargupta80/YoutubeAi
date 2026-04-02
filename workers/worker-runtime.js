import dotenv from "dotenv";
import { Worker } from "bullmq";
import { redis, closeRedis } from "../backend/config/redis.js";
import { insertQueueDeadLetter } from "../backend/services/queue-dead-letter.repository.js";
import { logError, logInfo } from "../backend/utils/logger.js";

dotenv.config({ path: "../backend/.env" });

export const LOCK_DURATION_MS = 30 * 60 * 1000;
export const LOCK_RENEW_MS = 60 * 1000;
export const STALLED_INTERVAL_MS = 2 * 60 * 1000;

async function archiveDeadLetter({ workerName, queueName, job, error }) {
  const maxAttempts = Number(job?.opts?.attempts || 0);
  const attemptsMade = Number(job?.attemptsMade || 0);
  if (!job || maxAttempts <= 0 || attemptsMade < maxAttempts) {
    return;
  }

  try {
    await insertQueueDeadLetter({
      queueName,
      workerName,
      bullJobId: job.id,
      jobName: job.name,
      notesJobId: job.data?.jobId || "",
      attemptsMade,
      maxAttempts,
      errorMessage: error?.message || String(error || "unknown worker failure"),
      payload: job.data || null
    });
    logInfo("Job archived to dead-letter store", {
      worker: workerName,
      queue: queueName,
      jobId: job.id,
      attemptsMade,
      maxAttempts
    });
  } catch (archiveError) {
    logError("Failed to archive dead-letter job", archiveError, {
      worker: workerName,
      queue: queueName,
      jobId: job?.id
    });
  }
}

export function createQueueWorker({ workerName, queueName, handler, concurrency }) {
  const worker = new Worker(queueName, async (job) => {
    await handler(job);
  }, {
    connection: redis,
    concurrency,
    lockDuration: LOCK_DURATION_MS,
    lockRenewTime: LOCK_RENEW_MS,
    stalledInterval: STALLED_INTERVAL_MS,
    maxStalledCount: 1,
    runRetryDelay: 15000
  });

  worker.on("completed", (job) => {
    logInfo("Job completed", { worker: workerName, queue: queueName, jobId: job.id });
  });

  worker.on("failed", async (job, error) => {
    logError("Job failed", error, { worker: workerName, queue: queueName, jobId: job?.id });
    await archiveDeadLetter({ workerName, queueName, job, error });
  });

  worker.on("error", (error) => {
    logError("Worker runtime error", error, {
      worker: workerName,
      queue: queueName,
      lockDurationMs: LOCK_DURATION_MS,
      lockRenewTimeMs: LOCK_RENEW_MS,
      stalledIntervalMs: STALLED_INTERVAL_MS
    });
  });

  logInfo("Worker started", {
    worker: workerName,
    queue: queueName,
    concurrency,
    lockDurationMs: LOCK_DURATION_MS,
    lockRenewTimeMs: LOCK_RENEW_MS,
    stalledIntervalMs: STALLED_INTERVAL_MS
  });

  return worker;
}

export function registerWorkerShutdown(workers, processName = "worker-process") {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo("Worker shutdown started", { processName, signal, workerCount: workers.length });

    try {
      await Promise.allSettled(workers.map((worker) => worker.close()));
      await closeRedis();
      logInfo("Worker shutdown complete", { processName, signal });
      process.exit(0);
    } catch (error) {
      logError("Worker shutdown failed", error, { processName, signal });
      process.exit(1);
    }
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    logError("Worker uncaught exception", error, { processName });
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (error) => {
    logError("Worker unhandled promise rejection", error instanceof Error ? error : new Error(String(error)), { processName });
    shutdown("unhandledRejection");
  });
}
