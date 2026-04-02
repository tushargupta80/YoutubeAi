import { enqueueNotesPipelineJob } from "../../backend/services/queue.js";
import { updateNoteJob } from "../../backend/services/notes.repository.js";
import { refundCreditsForNoteJob } from "../../backend/services/billing.service.js";
import { JobStatus } from "../../backend/models/job-status.js";
import { embedVideoArtifacts } from "../../backend/services/rag.service.js";
import { isJobCancelledError, markJobCancelled, throwIfJobCancelled } from "../../backend/services/job-cancellation.js";

export async function handleEmbedTranscript(job) {
  const { jobId, videoId, youtubeUrl, youtubeVideoId, userId, title, startedAt } = job.data;

  try {
    await throwIfJobCancelled(jobId);
    await updateNoteJob(jobId, {
      status: JobStatus.PROCESSING,
      progress: 40,
      stage: "embedding transcript"
    });

    const result = await embedVideoArtifacts({
      videoId,
      onProgress: async (progress, stage) => {
        await throwIfJobCancelled(jobId);
        await updateNoteJob(jobId, {
          progress: Math.min(progress, 68),
          stage,
          status: JobStatus.PROCESSING
        });
      }
    });

    await throwIfJobCancelled(jobId);
    await updateNoteJob(jobId, {
      status: JobStatus.PROCESSING,
      progress: 70,
      stage: `embeddings ready (${result.chunkCount} chunks)`
    });

    await enqueueNotesPipelineJob({
      jobId,
      videoId,
      youtubeUrl,
      youtubeVideoId,
      userId,
      title,
      startedAt: startedAt || Date.now()
    });
  } catch (error) {
    if (isJobCancelledError(error)) {
      await markJobCancelled(jobId);
      await refundCreditsForNoteJob(jobId, "cancelled_during_embedding");
      return;
    }

    await updateNoteJob(jobId, {
      status: JobStatus.FAILED,
      stage: "failed",
      error_message: error.message,
      progress: 100
    });
    await refundCreditsForNoteJob(jobId, "embedding_failed");
    throw error;
  }
}
