import { updateNoteJob } from "../../backend/services/notes.repository.js";
import { upsertVideo } from "../../backend/services/video.repository.js";
import { JobStatus } from "../../backend/models/job-status.js";
import { runNotesPipeline } from "../../backend/services/rag.service.js";

export async function handleGenerateNotes(job) {
  const { jobId, videoId, youtubeUrl, youtubeVideoId } = job.data;
  const startedAt = Date.now();

  await updateNoteJob(jobId, {
    status: JobStatus.PROCESSING,
    progress: 10,
    stage: "starting"
  });

  try {
    const title = `Study Notes for ${youtubeVideoId}`;
    const result = await runNotesPipeline({
      youtubeUrl,
      title,
      videoId,
      onProgress: async (progress, stage) => {
        await updateNoteJob(jobId, { progress, stage, status: JobStatus.PROCESSING });
      }
    });

    await upsertVideo({
      youtubeUrl,
      videoId: youtubeVideoId,
      title: result.notesJson.title || title,
      transcript: result.transcript,
      cleanedTranscript: result.cleanedTranscript,
      durationSeconds: result.durationSeconds
    });

    const processingSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    await updateNoteJob(jobId, {
      status: JobStatus.COMPLETED,
      progress: 100,
      stage: "completed",
      notes_markdown: result.notesMarkdown,
      notes_json: result.notesJson,
      flashcards: result.flashcards,
      quiz: result.quiz,
      generation_provider: result.provider || "unknown",
      processing_seconds: processingSeconds
    });
  } catch (error) {
    await updateNoteJob(jobId, {
      status: JobStatus.FAILED,
      stage: "failed",
      error_message: error.message,
      progress: 100
    });
    throw error;
  }
}