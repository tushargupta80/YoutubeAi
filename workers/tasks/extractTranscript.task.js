import { enqueueEmbeddingPipelineJob } from "../../backend/services/queue.js";
import { updateNoteJob } from "../../backend/services/notes.repository.js";
import { upsertVideo } from "../../backend/services/video.repository.js";
import { refundCreditsForNoteJob } from "../../backend/services/billing.service.js";
import { JobStatus } from "../../backend/models/job-status.js";
import { extractVideoArtifacts } from "../../backend/services/rag.service.js";
import { isJobCancelledError, markJobCancelled, throwIfJobCancelled } from "../../backend/services/job-cancellation.js";
import { normalizeJobErrorMessage } from "../../backend/utils/job-errors.js";

export async function handleExtractTranscript(job) {
  const { jobId, youtubeUrl, youtubeVideoId, userId, startedAt } = job.data;
  const title = `Study Notes for ${youtubeVideoId}`;

  try {
    await throwIfJobCancelled(jobId);
    await updateNoteJob(jobId, {
      status: JobStatus.PROCESSING,
      progress: 10,
      stage: "starting ingest"
    });

    const artifacts = await extractVideoArtifacts({
      youtubeUrl,
      onProgress: async (progress, stage) => {
        await throwIfJobCancelled(jobId);
        await updateNoteJob(jobId, {
          progress: Math.min(progress, 34),
          stage,
          status: JobStatus.PROCESSING
        });
      }
    });

    await throwIfJobCancelled(jobId);

    const video = await upsertVideo({
      youtubeUrl,
      videoId: youtubeVideoId,
      title,
      transcript: artifacts.transcript,
      transcriptItems: artifacts.transcriptItems,
      cleanedTranscript: artifacts.cleanedTranscript,
      durationSeconds: artifacts.durationSeconds
    });

    await throwIfJobCancelled(jobId);
    await updateNoteJob(jobId, {
      status: JobStatus.PROCESSING,
      progress: 35,
      stage: "transcript ready"
    });

    await enqueueEmbeddingPipelineJob({
      jobId,
      videoId: video.id,
      youtubeUrl,
      youtubeVideoId,
      userId,
      title,
      startedAt: startedAt || Date.now()
    });
  } catch (error) {
    if (isJobCancelledError(error)) {
      await markJobCancelled(jobId);
      await refundCreditsForNoteJob(jobId, "cancelled_during_ingest");
      return;
    }

    await updateNoteJob(jobId, {
      status: JobStatus.FAILED,
      stage: "failed",
      error_message: normalizeJobErrorMessage(error.message),
      progress: 100
    });
    await refundCreditsForNoteJob(jobId, "ingest_failed");
    throw error;
  }
}
