import { NOTES_QUEUE_NAME } from "../backend/services/queue.js";
import { handleGenerateFinalNotes } from "./tasks/generateFinalNotes.task.js";
import { createQueueWorker, registerWorkerShutdown } from "./worker-runtime.js";

const worker = createQueueWorker({
  workerName: "notes",
  queueName: NOTES_QUEUE_NAME,
  handler: handleGenerateFinalNotes,
  concurrency: 1
});

registerWorkerShutdown([worker], "notes-worker");
