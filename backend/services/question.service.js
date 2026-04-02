import { randomUUID } from "node:crypto";
import { qaQueue, qaQueueEvents } from "./queue.js";

const QUESTION_TIMEOUT_MS = 90 * 1000;

export async function answerQuestionViaQueue({ videoId, title, question, userId }) {
  const job = await qaQueue.add("answer-question", {
    videoId,
    title,
    question,
    userId
  }, {
    jobId: `qa:${videoId}:${randomUUID()}`
  });

  const result = await job.waitUntilFinished(qaQueueEvents, QUESTION_TIMEOUT_MS);
  return result?.answer || "";
}
