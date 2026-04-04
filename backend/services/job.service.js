import { randomUUID } from "node:crypto";
import { extractVideoId } from "../utils/youtube.js";
import { JobStatus } from "../models/job-status.js";
import {
  cancelPipelineJobs,
  enqueueEmbeddingPipelineJob,
  enqueueIngestPipelineJob,
  enqueueNotesPipelineJob,
  getPipelineJobSnapshot,
  hasLivePipelineJob
} from "./queue.js";
import {
  createCompletedJobFromExisting,
  createNoteJob,
  deleteNoteJob,
  findReusableCompletedNoteJobForVideo,
  findReusableNoteJob,
  getNoteJob,
  listOpenNoteJobsForRecovery,
  updateNoteJob
} from "./notes.repository.js";
import { getVideoByYoutubeUrl, upsertVideo } from "./video.repository.js";
import { isCancelledJobRecord, markJobCancelled } from "./job-cancellation.js";
import { refundCreditsForNoteJob, reserveCreditsForNotesJob } from "./billing.service.js";
import { logError, logInfo } from "../utils/logger.js";

function inferResumeStage(job) {
  const stage = String(job?.stage || "").toLowerCase();
  const progress = Number(job?.progress || 0);

  if (stage.includes("embedding") || stage.includes("transcript ready") || (progress >= 35 && progress < 70)) {
    return "embed";
  }

  if (stage.includes("generating notes") || stage.includes("embeddings ready") || progress >= 70) {
    return "notes";
  }

  return "ingest";
}

function buildManualTranscriptItems(transcript) {
  const words = String(transcript || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const chunkSize = 35;
  const items = [];

  for (let index = 0; index < words.length; index += chunkSize) {
    const text = words.slice(index, index + chunkSize).join(" ").trim();
    if (!text) continue;

    items.push({
      index: items.length,
      text,
      offset: items.length * 15000,
      duration: 15000
    });
  }

  return items;
}

async function requeuePipelineJob(existingJob, payload) {
  const stage = inferResumeStage(existingJob);

  if (stage === "embed") {
    await enqueueEmbeddingPipelineJob(payload);
  } else if (stage === "notes") {
    await enqueueNotesPipelineJob(payload);
  } else {
    await enqueueIngestPipelineJob(payload);
  }

  await updateNoteJob(existingJob.id, {
    status: existingJob.status === JobStatus.QUEUED ? JobStatus.QUEUED : JobStatus.PROCESSING,
    stage: stage === "notes"
      ? "resumed notes generation"
      : stage === "embed"
        ? "resumed embedding"
        : "resumed ingest"
  });

  logInfo("Requeued stale pipeline job", {
    jobId: existingJob.id,
    userId: payload.userId,
    videoId: payload.videoId,
    resumeStage: stage,
    previousStage: existingJob.stage,
    previousStatus: existingJob.status
  });

  return stage;
}

async function ensureLivePipelineJob(existingJob, payload) {
  const snapshot = await getPipelineJobSnapshot(existingJob.id);
  if (hasLivePipelineJob(snapshot)) {
    return false;
  }

  await requeuePipelineJob(existingJob, payload);
  return true;
}

export async function reconcileOpenNoteJobs() {
  const openJobs = await listOpenNoteJobsForRecovery();
  const summary = {
    scanned: openJobs.length,
    requeued: 0,
    skipped: 0,
    failed: 0
  };

  for (const job of openJobs) {
    try {
      if (isCancelledJobRecord(job)) {
        summary.skipped += 1;
        continue;
      }

      if (!job.video_id || !job.youtube_url || !job.youtube_video_id) {
        await updateNoteJob(job.id, {
          status: JobStatus.FAILED,
          stage: "failed",
          error_message: "Unable to recover stale job: missing video metadata",
          progress: 100
        });
        await refundCreditsForNoteJob(job.id, "recovery_missing_video_metadata");
        summary.failed += 1;
        continue;
      }

      const requeued = await ensureLivePipelineJob(job, {
        jobId: job.id,
        videoId: job.video_id,
        youtubeUrl: job.youtube_url,
        youtubeVideoId: job.youtube_video_id,
        userId: job.user_id,
        title: job.video_title,
        startedAt: Date.now()
      });

      if (requeued) {
        summary.requeued += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      logError("Failed to reconcile stale note job", error, {
        jobId: job.id,
        userId: job.user_id,
        videoId: job.video_id,
        status: job.status,
        stage: job.stage
      });
    }
  }

  return summary;
}

export async function enqueueNotesJob(youtubeUrl, userId) {
  const youtubeVideoId = extractVideoId(youtubeUrl);
  const existingVideo = await getVideoByYoutubeUrl(youtubeUrl);
  const video = existingVideo || await upsertVideo({
    youtubeUrl,
    videoId: youtubeVideoId,
    title: `YouTube Video ${youtubeVideoId}`
  });

  const reusableJob = await findReusableNoteJob(video.id, userId);
  const startedAt = Date.now();
  const queuePayload = {
    videoId: video.id,
    youtubeUrl,
    youtubeVideoId,
    userId,
    startedAt
  };

  if (reusableJob) {
    if ([JobStatus.QUEUED, JobStatus.PROCESSING].includes(reusableJob.status)) {
      const requeued = await ensureLivePipelineJob(reusableJob, {
        ...queuePayload,
        jobId: reusableJob.id,
        title: reusableJob.video_title || video.title
      });

      const refreshedJob = await getNoteJob(reusableJob.id, userId);
      return {
        jobId: reusableJob.id,
        video,
        reusedJob: refreshedJob || reusableJob,
        reuseScope: requeued ? "same-user-requeued" : "same-user",
        creditsCharged: 0,
        balanceAfter: null
      };
    }

    return {
      jobId: reusableJob.id,
      video,
      reusedJob: reusableJob,
      reuseScope: "same-user",
      creditsCharged: 0,
      balanceAfter: null
    };
  }

  const sharedCompletedJob = await findReusableCompletedNoteJobForVideo(video.id);
  if (sharedCompletedJob) {
    const copiedJobId = await createCompletedJobFromExisting(sharedCompletedJob.id, userId);
    if (copiedJobId) {
      const copiedJob = await getNoteJob(copiedJobId, userId);
      return {
        jobId: copiedJobId,
        video,
        reusedJob: copiedJob,
        reuseScope: "cross-user",
        creditsCharged: 0,
        balanceAfter: null
      };
    }
  }

  const jobId = await createNoteJob(video.id, userId);

  try {
    const creditReservation = await reserveCreditsForNotesJob({ userId, jobId, youtubeUrl });

    try {
      await enqueueIngestPipelineJob({
        ...queuePayload,
        jobId
      });
    } catch (error) {
      await refundCreditsForNoteJob(jobId, "enqueue_failed");
      throw error;
    }

    return {
      jobId,
      video,
      reusedJob: null,
      reuseScope: null,
      creditsCharged: creditReservation.creditsCharged,
      balanceAfter: creditReservation.balanceAfter
    };
  } catch (error) {
    await deleteNoteJob(jobId).catch(() => {});
    throw error;
  }
}

export async function enqueueManualTranscriptNotesJob({ title, transcript, userId }) {
  const cleanedTranscript = String(transcript || "").replace(/\s+/g, " ").trim();
  const transcriptItems = buildManualTranscriptItems(cleanedTranscript);
  const manualId = randomUUID();
  const youtubeUrl = `manual://transcript/${manualId}`;
  const youtubeVideoId = `manual-${manualId.slice(0, 8)}`;
  const resolvedTitle = String(title || "").trim() || `Study Notes for ${youtubeVideoId}`;
  const startedAt = Date.now();

  const video = await upsertVideo({
    youtubeUrl,
    videoId: youtubeVideoId,
    title: resolvedTitle,
    transcript: cleanedTranscript,
    transcriptItems,
    cleanedTranscript,
    durationSeconds: Math.max(30, transcriptItems.length * 15)
  });

  const jobId = await createNoteJob(video.id, userId);

  try {
    const creditReservation = await reserveCreditsForNotesJob({ userId, jobId, youtubeUrl });

    try {
      await updateNoteJob(jobId, {
        status: JobStatus.PROCESSING,
        progress: 30,
        stage: "manual transcript received"
      });

      await enqueueEmbeddingPipelineJob({
        jobId,
        videoId: video.id,
        youtubeUrl,
        youtubeVideoId,
        userId,
        title: resolvedTitle,
        startedAt
      });
    } catch (error) {
      await refundCreditsForNoteJob(jobId, "enqueue_failed");
      throw error;
    }

    return {
      jobId,
      video,
      reusedJob: null,
      reuseScope: null,
      creditsCharged: creditReservation.creditsCharged,
      balanceAfter: creditReservation.balanceAfter
    };
  } catch (error) {
    await deleteNoteJob(jobId).catch(() => {});
    throw error;
  }
}

export async function fetchJobStatus(jobId, userId) {
  return getNoteJob(jobId, userId);
}

export async function cancelNotesJob(jobId, userId) {
  const job = await getNoteJob(jobId, userId);
  if (!job) {
    return null;
  }

  if ([JobStatus.COMPLETED, JobStatus.FAILED].includes(job.status) && !isCancelledJobRecord(job)) {
    return job;
  }

  await markJobCancelled(jobId);
  await cancelPipelineJobs(jobId);
  await refundCreditsForNoteJob(jobId, "user_cancelled");
  return getNoteJob(jobId, userId);
}
export async function deleteNotesJob(jobId, userId) {
  const job = await getNoteJob(jobId, userId);
  if (!job) {
    return null;
  }

  if ([JobStatus.QUEUED, JobStatus.PROCESSING].includes(job.status)) {
    await markJobCancelled(jobId);
    await cancelPipelineJobs(jobId);
    await refundCreditsForNoteJob(jobId, "user_deleted");
  }

  await deleteNoteJob(jobId);
  return {
    id: jobId,
    deleted: true,
    previousStatus: job.status
  };
}
