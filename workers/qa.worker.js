import { QA_QUEUE_NAME } from "../backend/services/queue.js";
import { handleAnswerQuestion } from "./tasks/answerQuestion.task.js";
import { createQueueWorker, registerWorkerShutdown } from "./worker-runtime.js";

const worker = createQueueWorker({
  workerName: "qa",
  queueName: QA_QUEUE_NAME,
  handler: handleAnswerQuestion,
  concurrency: 2
});

registerWorkerShutdown([worker], "qa-worker");
