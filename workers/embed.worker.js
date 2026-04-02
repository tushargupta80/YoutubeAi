import { EMBEDDING_QUEUE_NAME } from "../backend/services/queue.js";
import { handleEmbedTranscript } from "./tasks/embedTranscript.task.js";
import { createQueueWorker, registerWorkerShutdown } from "./worker-runtime.js";

const worker = createQueueWorker({
  workerName: "embed",
  queueName: EMBEDDING_QUEUE_NAME,
  handler: handleEmbedTranscript,
  concurrency: 2
});

registerWorkerShutdown([worker], "embed-worker");
