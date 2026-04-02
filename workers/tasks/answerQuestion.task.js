import { answerVideoQuestion } from "../../backend/services/rag.service.js";

export async function handleAnswerQuestion(job) {
  const { videoId, title, question } = job.data;
  const answer = await answerVideoQuestion({ videoId, title, question });
  return { answer };
}
