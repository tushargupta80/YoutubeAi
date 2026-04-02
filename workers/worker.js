import { env } from "../backend/config/env.js";
import { EMBEDDING_QUEUE_NAME, INGEST_QUEUE_NAME, NOTES_QUEUE_NAME, QA_QUEUE_NAME } from "../backend/services/queue.js";
import { reconcileOpenNoteJobs } from "../backend/services/job.service.js";
import { logError, logInfo } from "../backend/utils/logger.js";
import { handleExtractTranscript } from "./tasks/extractTranscript.task.js";
import { handleEmbedTranscript } from "./tasks/embedTranscript.task.js";
import { handleGenerateFinalNotes } from "./tasks/generateFinalNotes.task.js";
import { handleAnswerQuestion } from "./tasks/answerQuestion.task.js";
import { createQueueWorker, registerWorkerShutdown } from "./worker-runtime.js";

const RECONCILIATION_TIMEOUT_MS = 10000;

function createWorkers() {
  return [
    createQueueWorker({
      workerName: "ingest",
      queueName: INGEST_QUEUE_NAME,
      handler: handleExtractTranscript,
      concurrency: env.workerIngestConcurrency
    }),
    createQueueWorker({
      workerName: "embed",
      queueName: EMBEDDING_QUEUE_NAME,
      handler: handleEmbedTranscript,
      concurrency: env.workerEmbedConcurrency
    }),
    createQueueWorker({
      workerName: "notes",
      queueName: NOTES_QUEUE_NAME,
      handler: handleGenerateFinalNotes,
      concurrency: env.workerNotesConcurrency
    }),
    createQueueWorker({
      workerName: "qa",
      queueName: QA_QUEUE_NAME,
      handler: handleAnswerQuestion,
      concurrency: env.workerQaConcurrency
    })
  ];
}

async function runStartupReconciliation() {
  logInfo("Worker startup reconciliation started", { timeoutMs: RECONCILIATION_TIMEOUT_MS });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve({ timedOut: true });
    }, RECONCILIATION_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      reconcileOpenNoteJobs(),
      timeoutPromise
    ]);

    if (result?.timedOut) {
      logInfo("Worker startup reconciliation timed out", { timeoutMs: RECONCILIATION_TIMEOUT_MS });
      return;
    }

    logInfo("Worker startup reconciliation complete", result);
  } catch (error) {
    logError("Worker startup reconciliation failed", error, { timeoutMs: RECONCILIATION_TIMEOUT_MS });
  }
}

function startWorkers() {
  const workers = createWorkers();
  registerWorkerShutdown(workers, "all-workers");

  void runStartupReconciliation();
}

try {
  startWorkers();
} catch (error) {
  logError("Worker startup failed", error);
  process.exit(1);
}
