import { updateNoteJob } from "../../backend/services/notes.repository.js";
import { upsertVideo } from "../../backend/services/video.repository.js";
import { refundCreditsForNoteJob } from "../../backend/services/billing.service.js";
import { JobStatus } from "../../backend/models/job-status.js";
import { generateNotesFromArtifacts } from "../../backend/services/rag.service.js";
import { isJobCancelledError, markJobCancelled, throwIfJobCancelled } from "../../backend/services/job-cancellation.js";

export async function handleGenerateFinalNotes(job) {
  const { jobId, videoId, youtubeUrl, youtubeVideoId, title, startedAt } = job.data;
  const fallbackTitle = title || `Study Notes for ${youtubeVideoId}`;

  try {
    await throwIfJobCancelled(jobId);
    await updateNoteJob(jobId, {
      status: JobStatus.PROCESSING,
      progress: 72,
      stage: "generating notes"
    });

    const result = await generateNotesFromArtifacts({
      videoId,
      title: fallbackTitle,
      onProgress: async (progress, stage) => {
        await throwIfJobCancelled(jobId);
        await updateNoteJob(jobId, {
          progress,
          stage,
          status: JobStatus.PROCESSING
        });
      }
    });

    await throwIfJobCancelled(jobId);

    await upsertVideo({
      youtubeUrl,
      videoId: youtubeVideoId,
      title: result.notesJson.title || fallbackTitle,
      transcript: result.transcript,
      cleanedTranscript: result.cleanedTranscript,
      durationSeconds: result.durationSeconds
    });

    const processingSeconds = Math.max(1, Math.round((Date.now() - (startedAt || Date.now())) / 1000));

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
    if (isJobCancelledError(error)) {
      await markJobCancelled(jobId);
      await refundCreditsForNoteJob(jobId, "cancelled_during_note_generation");
      return;
    }

    await updateNoteJob(jobId, {
      status: JobStatus.FAILED,
      stage: "failed",
      error_message: error.message,
      progress: 100
    });
    await refundCreditsForNoteJob(jobId, "notes_generation_failed");
    throw error;
  }
}
