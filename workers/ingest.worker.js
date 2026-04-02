import { INGEST_QUEUE_NAME } from "../backend/services/queue.js";
import { handleExtractTranscript } from "./tasks/extractTranscript.task.js";
import { createQueueWorker, registerWorkerShutdown } from "./worker-runtime.js";

const worker = createQueueWorker({
  workerName: "ingest",
  queueName: INGEST_QUEUE_NAME,
  handler: handleExtractTranscript,
  concurrency: 2
});

registerWorkerShutdown([worker], "ingest-worker");
